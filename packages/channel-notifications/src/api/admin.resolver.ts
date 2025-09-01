import { Args, Mutation, Parent, Query, ResolveField, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, ID, PaginatedList, RelationPaths, Relations, RequestContext, Transaction, TransactionalConnection, Translated } from "@vendure/core";
import { permission } from "../constants";
import { ChannelNotification, ChannelNotificationReadEntry } from "../entities/channel-notification.entity";
import { DeletionResponse, MutationChannelNotificationCreateArgs, MutationChannelNotificationDeleteArgs, MutationChannelNotificationMarkAsReadArgs, MutationChannelNotificationUpdateArgs, QueryChannelNotificationListArgs, Success } from "../generated-admin-types";
import { ChannelNotificationsService } from "../services/main.service";

@Resolver()
export class AdminResolver {
  constructor(private service: ChannelNotificationsService) { }

  @Query()
  @Allow(permission.Read)
  async channelNotification(
    @Ctx() ctx: RequestContext,
    @Args() args: { id: ID },
    @Relations({ entity: ChannelNotification }) relations: RelationPaths<ChannelNotification>,
  ): Promise<Translated<ChannelNotification> | null> {
    return this.service.findOne(ctx, args.id, relations);
  }

  @Query()
  @Allow(permission.Read)
  async channelNotificationList(
    @Ctx() ctx: RequestContext,
    @Args() args: QueryChannelNotificationListArgs,
    @Relations({ entity: ChannelNotification }) relations: RelationPaths<ChannelNotification>,
  ): Promise<PaginatedList<Translated<ChannelNotification>>> {
    return this.service.findAll(ctx, args.options, relations);
  }

  @Mutation()
  @Transaction()
  @Allow(permission.Create)
  async channelNotificationCreate(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationChannelNotificationCreateArgs,
    @Relations({ entity: ChannelNotification }) relations: RelationPaths<ChannelNotification>,
  ): Promise<Translated<ChannelNotification>> {
    return this.service.create(ctx, args.input, relations);
  }

  @Mutation()
  @Transaction()
  @Allow(permission.Update)
  async channelNotificationUpdate(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationChannelNotificationUpdateArgs,
    @Relations({ entity: ChannelNotification }) relations: RelationPaths<ChannelNotification>,
  ): Promise<Translated<ChannelNotification>> {
    return this.service.update(ctx, args.input, relations);
  }

  @Mutation()
  @Transaction()
  @Allow(permission.Delete)
  async channelNotificationDelete(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationChannelNotificationDeleteArgs,
  ): Promise<DeletionResponse> {
    return this.service.delete(ctx, args.ids);
  }

  @Mutation()
  @Transaction()
  @Allow(permission.Update)
  async channelNotificationMarkAsRead(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationChannelNotificationMarkAsReadArgs,
  ): Promise<Success> {
    return this.service.markAsRead(ctx, args.input.ids);
  }
}

@Resolver("ChannelNotification")
export class FieldResolver {

  constructor(private connection: TransactionalConnection) { }

  @ResolveField()
  async readAt(
    @Ctx() ctx: RequestContext,
    @Parent() notification: ChannelNotification,
  ): Promise<Date | null> {
    const { activeUserId: userId } = ctx;
    if (!userId) return null;

    const entry = await this.connection.getRepository(ctx, ChannelNotificationReadEntry).findOneBy({
      userId,
      notificationId: notification.id,
      channels: { id: ctx.channelId }
    });
    if (!entry) return null;

    return entry.dateTime;
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
