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
import {
  BlockedCreateAdministratorEvent,
  BlockedCustomerRegistrationEvent,
} from "./events/user-registration-blocked.event";
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
    assertFunctions: AssertFunctionShopApi<any>[] | AssertFunctionAdminApi<any>[],
    args: MutationRegisterCustomerAccountArgs | MutationCreateAdministratorArgs,
  ): Promise<{ isAllowed: boolean; results: AssertFunctionResult[] }> {
    const promises = assertFunctions.map((f) => f(ctx, args));
    const results = await Promise.allSettled(promises);
    const rejecteds = results.filter((r) => r.status === "rejected");
    if (rejecteds.length !== 0)
      throw new Error(
        `${rejecteds.length}/${results.length} AssertionFunctions rejected. This should never happen. Handle errors in your assertions.`,
        { cause: rejecteds },
      );

    // Typescript needed a little help here (2025-04-25)
    // The compiler failed because it couldnt infer the fulfilled promises and thought its `PromiseSettledResult<AssertFunctionResult>`
    const fulfilleds = results.filter(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<AssertFunctionResult>[];
    const failures = fulfilleds.filter((f) => f.value.isAllowed === false);

    const operator =
      ctx.apiType === "shop" ? this.options.shop.assert.logicalOperator : this.options.admin.assert.logicalOperator;
    switch (operator) {
      case "AND": // In a logical "AND" everything must be true
        return { isAllowed: failures.length === 0, results: fulfilleds.map((f) => f.value) };

      case "OR": // In a logical "OR" at least one must be true
        return { isAllowed: failures.length !== fulfilleds.length, results: fulfilleds.map((f) => f.value) };

      default:
        throw new Error(
          `Unknown "logicalOperator" (${this.options.shop.assert.logicalOperator}) - This should never happen.`,
        );
    }
  }

  /** @internal */
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    // Irrelevant contexts
    if (context.getType<GqlContextType>() !== "graphql") return next.handle();

    const gqlCtx = GqlExecutionContext.create(context);
    const info = gqlCtx.getInfo<GraphQLResolveInfo>();

    if (info?.path?.typename !== "Mutation") return next.handle();

    const requestContext = await this.requestContextService.fromRequest(
      gqlCtx.getContext<{ req: Request; res: Response }>().req,
      info,
    );

    // Check if we can exit early
    switch (requestContext.apiType) {
      case "shop":
        if (this.options.shop.assert.functions.length === 0) return next.handle();
        break;

      case "admin":
        if (this.options.admin.assert.functions.length === 0) return next.handle();
        break;

      default:
        return next.handle();
    }

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
      return new Observable<NativeAuthStrategyError>((s) => {
        if (requestContext.apiType === "shop") {
          // Registering doesnt throw but returns a union
          s.next(new NativeAuthStrategyError());
          this.eventBus
            .publish(new BlockedCustomerRegistrationEvent(requestContext, args, result.results))
            .catch(() => {});
        } else {
          // CreateAdmin Mutation normally only returns `Administrator`, so we throw
          s.error(new NativeAuthStrategyError());
          this.eventBus
            .publish(new BlockedCreateAdministratorEvent(requestContext, args, result.results))
            .catch(() => {});
        }
        s.complete();
      });
    }

    return next.handle();
  }
}

/**
 * The UserRegistrationGuardPlugin let's you flexibly customize if and how you prevent users from registering with your Vendure instance.
 *
 * ```ts
 * import { UserRegistrationGuardPlugin } from "@danielbiegler/vendure-plugin-user-registration-guard";
 * export const config: VendureConfig = {
 *   // ...
 *   plugins: [
 *     UserRegistrationGuardPlugin.init({
 *       shop: {
 *         assert: {
 *           // AND means every single assertion must be true to allow user registration
 *           logicalOperator: "AND",
 *           functions: [ ], // Insert your assertions here
 *         },
 *       },
 *       admin: {
 *         assert: {
 *           // OR means user registration is allowed if a single assertion is true
 *           logicalOperator: "OR",
 *           functions: [ ], // You may leave this empty too
 *         },
 *       },
 *     }),
 *   ],
 * }
 * ```
 *
 * Please refer to the specific {@link PluginUserRegistrationGuardOptions} for how and what you can customize.
 *
 * ### 2. Create an assertion
 *
 * Here's an example assertion where we block customer registrations if the email ends with `example.com`:
 *
 * ```ts
 * const blockExampleDotCom: AssertFunctionShopApi = async (ctx, args) => {
 *   const isAllowed = !args.input.emailAddress.endsWith("example.com");
 *   return {
 *     isAllowed,
 *     reason: !isAllowed ? 'Failed because email ends with "example.com"' : undefined,
 *   };
 * };
 * ```
 *
 * The `reason` field is helpful for when you're subscribing to the published {@link BlockedCustomerRegistrationEvent} or {@link BlockedCreateAdministratorEvent} and want to log or understand why somebody got blocked.
 *
 * In your assertions you'll receive the [`RequestContext`](https://docs.vendure.io/reference/typescript-api/request/request-context) and the GraphQL arguments of the mutation, which by default are either [`RegisterCustomerInput`](https://docs.vendure.io/reference/graphql-api/shop/input-types#registercustomerinput) or [`CreateAdministratorInput`](https://docs.vendure.io/reference/graphql-api/admin/input-types#createadministratorinput) depending on the API type. For example, if you'd like to block IP ranges you can access the underlying [Express Request](https://docs.vendure.io/reference/typescript-api/request/request-context#req) object through the `RequestContext` .
 *
 * If you've extended your GraphQL API types you may override the TypeScript Generic to get completions in your assertion functions like so:
 *
 * ```ts
 * const example: AssertFunctionShopApi<{
 *   example: boolean;
 *   // ...
 * }> = async (ctx, args) => {
 *   return { isAllowed: args.example };
 * };
 * ```
 *
 * ### 3. Add it to the plugin
 *
 * ```ts
 * import { UserRegistrationGuardPlugin } from "@danielbiegler/vendure-plugin-user-registration-guard";
 * export const config: VendureConfig = {
 *   // ...
 *   plugins: [
 *     UserRegistrationGuardPlugin.init({
 *       shop: {
 *         assert: {
 *           logicalOperator: "AND",
 *           functions: [ blockExampleDotCom ],
 *         },
 *       },
 *       admin: {
 *         assert: {
 *           logicalOperator: "AND",
 *           functions: [],
 *         },
 *       },
 *     }),
 *   ],
 * }
 * ```
 *
 * ### 4. Try registering new customers
 *
 * ```graphql
 * mutation {
 *   registerCustomerAccount(input: {
 *     emailAddress: "example@example.com",
 *     # ...
 *   }) {
 *     __typename
 *   }
 * }
 * ```
 *
 * This user will now be blocked from registering according to our `blockExampleDotCom` assertion.
 *
 * #### Handling errors
 *
 * The plugin is non-intrusive and does not extend the API itself to avoid introducing unhandled errors in your code.
 *
 * It respects [`RegisterCustomerAccountResult`](https://docs.vendure.io/reference/graphql-api/shop/object-types#registercustomeraccountresult) being a Union, so we don't throw an error, but return a [`NativeAuthStrategyError`](https://docs.vendure.io/reference/graphql-api/shop/object-types#nativeauthstrategyerror). You may handle the error just like the other `RegisterCustomerAccountResult` types like [`PasswordValidationError`](https://docs.vendure.io/reference/graphql-api/shop/object-types#passwordvalidationerror) for example.
 *
 * In contrast, for admins we do throw the error! This is a little different because by default the [`createAdministrator`](https://docs.vendure.io/reference/graphql-api/admin/mutations#createadministrator) mutation does not return a Union with error types.
 *
 * Granted, the `NativeAuthStrategyError` is technically not correct for blocking registrations and doesn't communicate the blocking properly, but it's the only reasonable error type in the Union for a default non-api-extended Vendure instance. You might want to add some comments in your registration logic that the error means blockage.
 *
 * ### 5. Subscribe to events
 *
 * You may want to [subscribe](https://docs.vendure.io/guides/developer-guide/events/#subscribing-to-events) to the [EventBus](https://docs.vendure.io/reference/typescript-api/events/event-bus) to monitor blocked registration attempts.
 *
 * ```ts
 * this.eventBus
 *   .ofType(BlockedCustomerRegistrationEvent<MutationRegisterCustomerAccountArgs>)
 *   .subscribe(async (event) => {
 *     const rejecteds = event.assertions.filter((a) => !a.isAllowed);
 *     console.log(`Blocked customer registration! ${rejecteds.length}/${event.assertions.length} assertions failed, see reasons:`);
 *     rejecteds.forEach(r => console.log("  -", r.reason));
 *
 *     // Example output:
 *     // Blocked customer registration! 1/1 assertions failed, see reasons:
 *     //   - Failed because email ends with "example.com"
 *   });
 *
 * this.eventBus
 *   // You can even override the passed in args if you've extended your Graphql API
 *   .ofType(BlockedCreateAdministratorEvent<{ example: boolean }>).subscribe(async (event) => {
 *     event.args.example // is typed now! :)
 *   });
 * ```
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
   *   shop: {
   *     assert: {
   *       logicalOperator: "AND",
   *       functions: [firstFunc, secondFunc],
   *     },
   *   },
   *   admin: {
   *     assert: {
   *       logicalOperator: "OR",
   *       functions: [],
   *     },
   *   },
   * }),
   * ```
   */
  static init(options: PluginUserRegistrationGuardOptions) {
    this.options = options;
    return UserRegistrationGuardPlugin;
  }
}
