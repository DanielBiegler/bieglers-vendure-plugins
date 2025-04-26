import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { GqlContextType, GqlExecutionContext } from "@nestjs/graphql";
import {
  EventBus,
  NativeAuthStrategyError,
  PluginCommonModule,
  RequestContext,
  RequestContextService,
  VendurePlugin,
} from "@vendure/core";
import type { Request, Response } from "express";
import type { GraphQLResolveInfo } from "graphql";
import { Observable } from "rxjs";
import { PLUGIN_INIT_OPTIONS } from "./constants";
import { UserRegistrationBlockedEvent } from "./events/user-registration-blocked.event";
import { MutationCreateAdministratorArgs } from "./generated-admin-types";
import { MutationRegisterCustomerAccountArgs } from "./generated-shop-types";
import {
  AssertFunctionAdminApi,
  AssertFunctionResult,
  AssertFunctionShopApi,
  PluginUserRegistrationGuardOptions,
} from "./types";

/**
 * Since this interceptor will be registered globally it will run between every single request.
 * This means we must make sure to exit as early as possible in order to not slow down the Vendure instance.
 */
@Injectable()
export class UserRegistrationInterceptor implements NestInterceptor {
  constructor(
    private eventBus: EventBus,
    private requestContextService: RequestContextService,
    @Inject(PLUGIN_INIT_OPTIONS)
    private options: PluginUserRegistrationGuardOptions,
  ) {}

  /** @internal */
  private async _isAllowed(
    ctx: RequestContext,
    assertFunctions: AssertFunctionShopApi[] | AssertFunctionAdminApi[],
    args: MutationRegisterCustomerAccountArgs | MutationCreateAdministratorArgs,
  ): Promise<{ isAllowed: boolean; results: AssertFunctionResult[] }> {
    const promises = assertFunctions.map((f) => f(ctx, args.input)); // TODO Why does typescript want to merge the types here?
    const results = await Promise.allSettled(promises);
    const rejecteds = results.filter((r) => r.status === "rejected");
    if (rejecteds.length !== 0) throw rejecteds; // TODO is this ok? Maybe return `new NativeAuthStrategyError();`

    // Typescript needed a little help here (2025-04-25)
    // The compiler failed because it couldnt infer the fulfilled promises and thought its `PromiseSettledResult<AssertFunctionResult>`
    const fulfilleds = results.filter(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<AssertFunctionResult>[];
    const failures = fulfilleds.filter((f) => f.value.isAllowed === false);

    switch (this.options.shop.assert.logicalOperator) {
      case "AND": // In a logical "AND" everything must be true
        return { isAllowed: failures.length === 0, results: fulfilleds.map((f) => f.value) };

      case "OR": // In a logical "OR" at least one must be true
        return { isAllowed: failures.length !== fulfilleds.length, results: fulfilleds.map((f) => f.value) };

      default:
        // TODO is error ok?
        throw new Error(
          `Unknown "logicalOperator" (${this.options.shop.assert.logicalOperator}) - This should never happen.`,
        );
    }
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    // Irrelevant contexts
    if (context.getType<GqlContextType>() !== "graphql") return next.handle();
    // No work that needs to be done
    if (this.options.shop.assert.functions.length === 0) return next.handle();
    // TODO admin

    const gqlCtx = GqlExecutionContext.create(context);
    const info = gqlCtx.getInfo<GraphQLResolveInfo>();

    if (info?.path?.typename !== "Mutation") return next.handle();

    const requestContext = await this.requestContextService.fromRequest(
      gqlCtx.getContext<{ req: Request; res: Response }>().req,
      info,
    );

    let result;
    let args: MutationRegisterCustomerAccountArgs | MutationCreateAdministratorArgs;
    switch (info?.path?.key) {
      case "registerCustomerAccount":
        args = gqlCtx.getArgs<MutationRegisterCustomerAccountArgs>();
        result = await this._isAllowed(requestContext, this.options.shop.assert.functions, args);
        break;
      case "createAdministrator":
        args = gqlCtx.getArgs<MutationCreateAdministratorArgs>();
        result = await this._isAllowed(requestContext, this.options.admin.assert.functions, args);
        break;

      default:
        return next.handle();
    }

    if (!result.isAllowed) {
      await this.eventBus.publish(new UserRegistrationBlockedEvent(requestContext, args.input, result.results));
      return new Observable<NativeAuthStrategyError>((s) => {
        if (requestContext.apiType === "shop") {
          // Registering doesnt throw but returns a union
          s.next(new NativeAuthStrategyError());
        } else {
          // CreateAdmin Mutation normally only returns `Administrator`, so we throw
          s.error(new NativeAuthStrategyError());
        }
        s.complete();
      });
    }

    return next.handle();
  }
}

/**
 * // TODO
 *
 * @category Plugin
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    {
      provide: PLUGIN_INIT_OPTIONS,
      useFactory: () => UserRegistrationGuardPlugin.options,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: UserRegistrationInterceptor,
    },
  ],
  configuration: (config) => {
    return config;
  },
  compatibility: ">=3.0.0",
})
export class UserRegistrationGuardPlugin {
  /** @internal */
  static options: PluginUserRegistrationGuardOptions;

  /**
   * The static `init()` method is called with the options to configure the plugin.
   *
   * @example
   * ```ts
   * UserRegistrationGuardPlugin.init({
   *   // TODO
   * }),
   * ```
   */
  static init(options: PluginUserRegistrationGuardOptions) {
    this.options = options;
    return UserRegistrationGuardPlugin;
  }
}
