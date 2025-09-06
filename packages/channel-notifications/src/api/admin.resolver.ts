import { Args, Mutation, Parent, Query, ResolveField, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, ID, PaginatedList, RelationPaths, Relations, RequestContext, Transaction, Translated } from "@vendure/core";
import { permission } from "../constants";
import { ChannelNotification, ChannelNotificationReadReceipt } from "../entities/channel-notification.entity";
import { DeletionResponse, MutationCreateChannelNotificationArgs, MutationDeleteChannelNotificationArgs, MutationMarkChannelNotificationAsReadArgs, MutationUpdateChannelNotificationArgs, QueryChannelNotificationListArgs, Success } from "../generated-admin-types";
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
  async CreateChannelNotification(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationCreateChannelNotificationArgs,
    @Relations({ entity: ChannelNotification }) relations: RelationPaths<ChannelNotification>,
  ): Promise<Translated<ChannelNotification>> {
    return this.service.create(ctx, args.input, relations);
  }

  @Mutation()
  @Transaction()
  @Allow(permission.Update)
  async UpdateChannelNotification(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationUpdateChannelNotificationArgs,
    @Relations({ entity: ChannelNotification }) relations: RelationPaths<ChannelNotification>,
  ): Promise<Translated<ChannelNotification>> {
    return this.service.update(ctx, args.input, relations);
  }

  @Mutation()
  @Transaction()
  @Allow(permission.Delete)
  async DeleteChannelNotification(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationDeleteChannelNotificationArgs,
  ): Promise<DeletionResponse> {
    return this.service.delete(ctx, args.input);
  }

  @Mutation()
  @Transaction()
  @Allow(permission.Read)
  async MarkChannelNotificationAsRead(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationMarkChannelNotificationAsReadArgs,
  ): Promise<Success> {
    return this.service.markAsRead(ctx, args.input);
  }
}

@Resolver("ChannelNotification")
export class FieldResolver {
  constructor(private service: ChannelNotificationsService) { }

  @Allow(permission.Read)
  @ResolveField()
  async readReceipt(
    @Ctx() ctx: RequestContext,
    @Parent() notification: ChannelNotification,
  ): Promise<ChannelNotificationReadReceipt | null> {
    return this.service.getReadReceiptForActiveUser(ctx, notification);
  }

  @Allow(permission.Read)
  @ResolveField()
  async readAt(
    @Ctx() ctx: RequestContext,
    @Parent() notification: ChannelNotification,
  ): Promise<Date | null> {
    const receipt = await this.service.getReadReceiptForActiveUser(ctx, notification);
    return receipt?.dateTime ?? null;
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
