import { Inject, Injectable } from "@nestjs/common";
import {
  assertFound,
  Asset,
  ChannelService,
  CustomFieldRelationService,
  EventBus,
  ID,
  ListQueryBuilder,
  ListQueryOptions,
  Logger,
  PaginatedList,
  RelationPaths,
  RequestContext,
  TransactionalConnection,
  TranslatableSaver,
  Translated,
  TranslatorService
} from "@vendure/core";
import { In } from "typeorm";
import {
  loggerCtx,
  PLUGIN_INIT_OPTIONS
} from "../constants";
import { UserNotification, UserNotificationReadEntry, UserNotificationTranslation } from "../entities/user-notification.entity";
import { DeletionResponse, DeletionResult, Success, UserNotificationCreateInput, UserNotificationUpdateInput } from "../generated-admin-types";
import { UserNotificationsOptions } from "../types";

/**
 * // TODO
 *
 * @category Services
 */
@Injectable()
export class UserNotificationsService {
  /** @internal */
  constructor(
    private channelService: ChannelService,
    private connection: TransactionalConnection,
    private customFieldRelationService: CustomFieldRelationService,
    private eventBus: EventBus,
    private listQueryBuilder: ListQueryBuilder,
    private translatableSaver: TranslatableSaver,
    private translator: TranslatorService,
    @Inject(PLUGIN_INIT_OPTIONS)
    private options: UserNotificationsOptions,
  ) { }

  async findOne(
    ctx: RequestContext,
    id: ID,
    relations?: RelationPaths<UserNotification>
  ): Promise<Translated<UserNotification> | null> {
    const entity = await this.connection.findOneInChannel(ctx, UserNotification, id, ctx.channelId, { relations });
    if (!entity) return null;
    return this.translator.translate(entity, ctx);
  }

  async findAll(
    ctx: RequestContext,
    options?: ListQueryOptions<UserNotification>,
    relations?: RelationPaths<UserNotification>
  ): Promise<PaginatedList<Translated<UserNotification>>> {
    return this.listQueryBuilder
      .build(
        UserNotification,
        options,
        {
          relations,
          channelId: ctx.channelId,
          orderBy: { dateTime: options?.sort?.dateTime ?? 'DESC' },
          ctx,
        }
      )
      .getManyAndCount()
      .then(async ([notifications, totalItems]) => {
        const items = notifications.map(n => this.translator.translate(n, ctx));
        return { items, totalItems, };
      });
  }

  async create(
    ctx: RequestContext,
    input: UserNotificationCreateInput,
    relations?: RelationPaths<UserNotification>
  ): Promise<Translated<UserNotification>> {
    const asset = input.idAsset ? await this.connection.getEntityOrThrow(ctx, Asset, input.idAsset, { channelId: ctx.channelId }) : null;
    const assetId = asset?.id || null;

    const entity = await this.translatableSaver.create({
      ctx,
      input,
      entityType: UserNotification,
      translationType: UserNotificationTranslation,
      beforeSave: async entity => {
        await this.channelService.assignToCurrentChannel(entity, ctx);
        entity.asset = asset;
        entity.assetId = assetId;
      },
    });
    Logger.verbose(`Created UserNotification (${entity.id})`, loggerCtx);

    // TODO eventbus event
    // TODO customfields
    // await this.customFieldRelationService.updateRelations(ctx, UserNotification, input, entity);

    return assertFound(this.findOne(ctx, entity.id, relations));
  }

  async update(
    ctx: RequestContext,
    input: UserNotificationUpdateInput,
    relations?: RelationPaths<UserNotification>
  ): Promise<Translated<UserNotification>> {
    const entity = await this.connection.getEntityOrThrow(ctx, UserNotification, input.id, { channelId: ctx.channelId });
    const asset = input.idAsset ? await this.connection.getEntityOrThrow(ctx, Asset, input.idAsset, { channelId: ctx.channelId }) : null;
    const assetId = asset?.id ?? null;

    await this.translatableSaver.update({
      ctx,
      input,
      entityType: UserNotification,
      translationType: UserNotificationTranslation,
      beforeSave: async entity => {
        // Only update asset if actually present, null to delete
        if (input.idAsset !== undefined) {
          // TODO how does this play with multiple channels where the other channels cant see this asset?
          // If we decide to restrict sharing you should revisit the delete function
          entity.asset = asset;
          entity.assetId = assetId;
        }
      }
    });
    Logger.verbose(`Updated UserNotification (${entity.id})`, loggerCtx);

    // TODO customfields
    // TODO eventbus

    return assertFound(this.findOne(ctx, entity.id, relations));
  }

  // TODO determine if we even wanna allow cross-channel notification sharing
  async delete(ctx: RequestContext, ids: ID[]): Promise<DeletionResponse> {
    // Let there be three channels: DEFAULT, VendorA, VendorB
    // Lets say channel VendorA and VendorB share the same notification
    // The junction table looks like this:
    // [
    //   { userNotificationId: 1, channelId: DEFAULT },
    //   { userNotificationId: 1, channelId: VendorA },
    //   { userNotificationId: 1, channelId: VendorB },
    // ]
    // If we now delete the notification in channel VendorA, it should still exist in VendorB
    // Due to delete cascades by default it would be removed in all channels
    // So we have to make sure to only delete the notification in the current channel

    const castedIds = ids.map(id => String(id));
    let countDeleted = 0;

    const defaultChannelId = (await this.channelService.getDefaultChannel()).id;
    if (defaultChannelId === ctx.channelId) {
      // We are in the default channel, so we can delete the notifications completely
      const deleteResult = await this.connection.getRepository(ctx, UserNotification).delete({ id: In(castedIds) });
      countDeleted += deleteResult.affected ?? 0;
    } else {
      // Check if there are any channels left for the notification, if not, delete it completely
      const notifications = await this.connection.findByIdsInChannel(ctx, UserNotification, castedIds, ctx.channelId, { relations: ['channels'] });
      const idsToDeleteFromChannel = notifications.filter(n => n.channels.length > 2).map(n => n.id); // 2 because default-channel plus the active channel
      const idsToDeleteCompletely = notifications.filter(n => n.channels.length <= 2).map(n => n.id); // 2 because default-channel plus the active channel

      if (idsToDeleteFromChannel.length > 0) {
        await Promise.all(idsToDeleteFromChannel.map(id => this.channelService.removeFromChannels(ctx, UserNotification, id, [ctx.channelId])));
        countDeleted += idsToDeleteFromChannel.length;
      }

      if (idsToDeleteCompletely.length > 0) {
        const deleteResult = await this.connection.getRepository(ctx, UserNotification).delete({ id: In(idsToDeleteCompletely) });
        countDeleted += deleteResult.affected ?? 0;
      }
    }

    const result = countDeleted === ids.length ? DeletionResult.DELETED : DeletionResult.NOT_DELETED;
    const message = `${countDeleted} of ${ids.length} UserNotifications deleted`; // TODO i18n?

    // TODO logging ?
    // TODO eventbus events

    return { result, message };
  }

  async markAsRead(ctx: RequestContext, ids: ID[]): Promise<Success> {
    const { activeUserId } = ctx;
    if (!activeUserId) return { success: false };

    for (const id of ids) {
      await this.connection.getEntityOrThrow(ctx, UserNotification, id, { channelId: ctx.channelId });

      const readEntryExists = await this.connection.getRepository(ctx, UserNotificationReadEntry).existsBy({
        channels: { id: ctx.channelId },
        notificationId: id,
        userId: ctx.activeUserId,
      });

      if (readEntryExists) continue;

      const entry = new UserNotificationReadEntry({ dateTime: new Date(), notificationId: id, userId: ctx.activeUserId });
      await this.channelService.assignToCurrentChannel(entry, ctx);

      await this.connection.getRepository(ctx, UserNotificationReadEntry).save(entry);

      // TODO eventbus?
      // TODO customfields?
    }

    return { success: true };
  }
}
