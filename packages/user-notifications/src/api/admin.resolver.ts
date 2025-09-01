import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, ID, PaginatedList, RelationPaths, Relations, RequestContext, Transaction, Translated } from "@vendure/core";
import { permission } from "../constants";
import { UserNotification } from "../entities/user-notification.entity";
import { DeletionResponse, MutationUserNotificationCreateArgs, MutationUserNotificationDeleteArgs, MutationUserNotificationUpdateArgs, QueryUserNotificationListArgs } from "../generated-admin-types";
import { UserNotificationsService } from "../services/main.service";

@Resolver()
export class AdminResolver {
  constructor(private service: UserNotificationsService) { }

  @Query()
  @Allow(permission.Read)
  async userNotification(
    @Ctx() ctx: RequestContext,
    @Args() args: { id: ID },
    @Relations({ entity: UserNotification }) relations: RelationPaths<UserNotification>,
  ): Promise<Translated<UserNotification> | null> {
    return this.service.findOne(ctx, args.id, relations);
  }

  @Query()
  @Allow(permission.Read)
  async userNotificationList(
    @Ctx() ctx: RequestContext,
    @Args() args: QueryUserNotificationListArgs,
    @Relations({ entity: UserNotification }) relations: RelationPaths<UserNotification>,
  ): Promise<PaginatedList<Translated<UserNotification>>> {
    return this.service.findAll(ctx, args.options, relations);
  }

  @Mutation()
  @Transaction()
  @Allow(permission.Create)
  async userNotificationCreate(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationUserNotificationCreateArgs,
    @Relations({ entity: UserNotification }) relations: RelationPaths<UserNotification>,
  ): Promise<Translated<UserNotification>> {
    return this.service.create(ctx, args.input, relations);
  }

  @Mutation()
  @Transaction()
  @Allow(permission.Update)
  async userNotificationUpdate(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationUserNotificationUpdateArgs,
    @Relations({ entity: UserNotification }) relations: RelationPaths<UserNotification>,
  ): Promise<Translated<UserNotification>> {
    return this.service.update(ctx, args.input, relations);
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
