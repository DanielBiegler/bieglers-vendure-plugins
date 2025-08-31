import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, RequestContext, Transaction } from "@vendure/core";
import { permission } from "../constants";
import { UserNotification } from "../entities/user-notification.entity";
import { DeletionResponse, MutationUserNotificationCreateArgs, MutationUserNotificationDeleteArgs } from "../generated-admin-types";
import { UserNotificationsService } from "../services/main.service";

@Resolver()
export class AdminResolver {
  constructor(private service: UserNotificationsService) { }

  @Mutation()
  @Transaction()
  @Allow(permission.Create)
  async userNotificationCreate(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationUserNotificationCreateArgs,
  ): Promise<UserNotification> {
    return this.service.create(ctx, args.input);
  }

  @Mutation()
  @Transaction()
  @Allow(permission.Delete)
  async userNotificationDelete(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationUserNotificationDeleteArgs,
  ): Promise<DeletionResponse> {
    return this.service.delete(ctx, args.ids);
  }
}

// In case you need a field resolver for result unions
// 
// @Resolver("ExamplePluginCreateResult")
// export class ExamplePluginCreateResultResolver {
//   @ResolveField()
//   __resolveType(value: any): string {
//     // If it has an "id" property we can assume it is an `Asset`
//     return value.hasOwnProperty("id") ? "Asset" : "PluginExampleCreateResult";
//   }
// }
