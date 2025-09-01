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
import { ChannelNotification, ChannelNotificationReadEntry, ChannelNotificationTranslation } from "../entities/channel-notification.entity";
import { DeletionResponse, DeletionResult, Success, UserNotificationCreateInput, UserNotificationUpdateInput } from "../generated-admin-types";
import { ChannelNotificationsOptions } from "../types";

/**
 * // TODO
 *
 * @category Services
 */
@Injectable()
export class ChannelNotificationsService {
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
    private options: ChannelNotificationsOptions,
  ) { }

  async findOne(
    ctx: RequestContext,
    id: ID,
    relations?: RelationPaths<ChannelNotification>
  ): Promise<Translated<ChannelNotification> | null> {
    const entity = await this.connection.findOneInChannel(ctx, ChannelNotification, id, ctx.channelId, { relations });
    if (!entity) return null;
    return this.translator.translate(entity, ctx);
  }

  async findAll(
    ctx: RequestContext,
    options?: ListQueryOptions<ChannelNotification>,
    relations?: RelationPaths<ChannelNotification>
  ): Promise<PaginatedList<Translated<ChannelNotification>>> {
    return this.listQueryBuilder
      .build(
        ChannelNotification,
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
    relations?: RelationPaths<ChannelNotification>
  ): Promise<Translated<ChannelNotification>> {
    const asset = input.idAsset ? await this.connection.getEntityOrThrow(ctx, Asset, input.idAsset, { channelId: ctx.channelId }) : null;
    const assetId = asset?.id || null;

    const entity = await this.translatableSaver.create({
      ctx,
      input,
      entityType: ChannelNotification,
      translationType: ChannelNotificationTranslation,
      beforeSave: async entity => {
        await this.channelService.assignToCurrentChannel(entity, ctx);
        entity.asset = asset;
        entity.assetId = assetId;
      },
    });
    Logger.verbose(`Created ChannelNotification (${entity.id})`, loggerCtx);

    // TODO eventbus event
    // TODO customfields
    // await this.customFieldRelationService.updateRelations(ctx, ChannelNotification, input, entity);

    return assertFound(this.findOne(ctx, entity.id, relations));
  }

  async update(
    ctx: RequestContext,
    input: UserNotificationUpdateInput,
    relations?: RelationPaths<ChannelNotification>
  ): Promise<Translated<ChannelNotification>> {
    const entity = await this.connection.getEntityOrThrow(ctx, ChannelNotification, input.id, { channelId: ctx.channelId });
    const asset = input.idAsset ? await this.connection.getEntityOrThrow(ctx, Asset, input.idAsset, { channelId: ctx.channelId }) : null;
    const assetId = asset?.id ?? null;

    await this.translatableSaver.update({
      ctx,
      input,
      entityType: ChannelNotification,
      translationType: ChannelNotificationTranslation,
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
    Logger.verbose(`Updated ChannelNotification (${entity.id})`, loggerCtx);

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
      const deleteResult = await this.connection.getRepository(ctx, ChannelNotification).delete({ id: In(castedIds) });
      countDeleted += deleteResult.affected ?? 0;
    } else {
      // Check if there are any channels left for the notification, if not, delete it completely
      const notifications = await this.connection.findByIdsInChannel(ctx, ChannelNotification, castedIds, ctx.channelId, { relations: ['channels'] });
      const idsToDeleteFromChannel = notifications.filter(n => n.channels.length > 2).map(n => n.id); // 2 because default-channel plus the active channel
      const idsToDeleteCompletely = notifications.filter(n => n.channels.length <= 2).map(n => n.id); // 2 because default-channel plus the active channel

      if (idsToDeleteFromChannel.length > 0) {
        await Promise.all(idsToDeleteFromChannel.map(id => this.channelService.removeFromChannels(ctx, ChannelNotification, id, [ctx.channelId])));
        countDeleted += idsToDeleteFromChannel.length;
      }

      if (idsToDeleteCompletely.length > 0) {
        const deleteResult = await this.connection.getRepository(ctx, ChannelNotification).delete({ id: In(idsToDeleteCompletely) });
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
      await this.connection.getEntityOrThrow(ctx, ChannelNotification, id, { channelId: ctx.channelId });

      const readEntryExists = await this.connection.getRepository(ctx, ChannelNotificationReadEntry).existsBy({
        channels: { id: ctx.channelId },
        notificationId: id,
        userId: ctx.activeUserId,
      });

      if (readEntryExists) continue;

      const entry = new ChannelNotificationReadEntry({ dateTime: new Date(), notificationId: id, userId: ctx.activeUserId });
      await this.channelService.assignToCurrentChannel(entry, ctx);

      await this.connection.getRepository(ctx, ChannelNotificationReadEntry).save(entry);

      // TODO eventbus?
      // TODO customfields?
    }

    return { success: true };
  }
}
