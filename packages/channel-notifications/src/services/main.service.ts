import { Inject, Injectable } from "@nestjs/common";
import {
  assertFound,
  Asset,
  ChannelService,
  CustomFieldRelationService,
  EntityNotFoundError,
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
import {
  loggerCtx,
  PLUGIN_INIT_OPTIONS
} from "../constants";
import { ChannelNotification, ChannelNotificationReadReceipt, ChannelNotificationTranslation } from "../entities/channel-notification.entity";
import { ChannelNotificationEvent, ChannelNotificationEventMarkedAsRead } from "../events";
import { CreateChannelNotificationInput, DeleteChannelNotificationInput, DeletionResponse, DeletionResult, MarkChannelNotificationAsReadInput, Success, UpdateChannelNotificationInput } from "../generated-admin-types";
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

  /**
   * Is channel aware and translates the entity as well.
   */
  async findOne(
    ctx: RequestContext,
    id: ID,
    relations?: RelationPaths<ChannelNotification>
  ): Promise<Translated<ChannelNotification> | null> {
    const entity = await this.connection.findOneInChannel(ctx, ChannelNotification, id, ctx.channelId, { relations });
    if (!entity) return null;
    return this.translator.translate(entity, ctx);
  }

  /**
   * By default orders via DESC datetime.
   * Is channel-aware and translates the entity as well.
   */
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
    input: CreateChannelNotificationInput,
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

    await this.customFieldRelationService.updateRelations(ctx, ChannelNotification, input, entity);

    Logger.verbose(`Created ChannelNotification (${entity.id})`, loggerCtx);
    await this.eventBus.publish(new ChannelNotificationEvent(ctx, entity, "created", input));

    return assertFound(this.findOne(ctx, entity.id, relations));
  }

  async update(
    ctx: RequestContext,
    input: UpdateChannelNotificationInput,
    relations?: RelationPaths<ChannelNotification>
  ): Promise<Translated<ChannelNotification>> {
    await this.connection.getEntityOrThrow(ctx, ChannelNotification, input.id, { channelId: ctx.channelId });
    const asset = input.idAsset ? await this.connection.getEntityOrThrow(ctx, Asset, input.idAsset, { channelId: ctx.channelId }) : null;
    const assetId = asset?.id ?? null;

    const entity = await this.translatableSaver.update({
      ctx,
      input,
      entityType: ChannelNotification,
      translationType: ChannelNotificationTranslation,
      beforeSave: async entity => {
        // Only update asset if actually present, null to delete
        if (input.idAsset !== undefined) {
          entity.asset = asset;
          entity.assetId = assetId;
        }
      }
    });

    await this.customFieldRelationService.updateRelations(ctx, ChannelNotification, input, entity);

    Logger.verbose(`Updated ChannelNotification (${entity.id})`, loggerCtx);
    await this.eventBus.publish(new ChannelNotificationEvent(ctx, entity, "updated", input));

    return assertFound(this.findOne(ctx, entity.id, relations));
  }

  async delete(ctx: RequestContext, input: DeleteChannelNotificationInput): Promise<DeletionResponse> {
    const entity = await this.findOne(ctx, input.id);
    if (!entity) throw new EntityNotFoundError("ChannelNotification", input.id);

    // TODO should this be caught and return NOT_DELETED?
    await this.connection.getRepository(ctx, ChannelNotification).remove(entity);

    Logger.verbose(`Deleted ChannelNotification (${entity.id})`, loggerCtx);
    await this.eventBus.publish(new ChannelNotificationEvent(ctx, entity, "deleted", input));

    return { result: DeletionResult.DELETED }
  }

  async markAsRead(ctx: RequestContext, input: MarkChannelNotificationAsReadInput): Promise<Success> {
    const { activeUserId } = ctx;
    if (!activeUserId) return { success: false };

    for (const id of input.ids) {
      await this.connection.getEntityOrThrow(ctx, ChannelNotification, id, { channelId: ctx.channelId });

      const readEntryExists = await this.connection.getRepository(ctx, ChannelNotificationReadReceipt).existsBy({
        channels: { id: ctx.channelId },
        notificationId: id,
        userId: activeUserId,
      });

      if (readEntryExists) continue;

      const entry = new ChannelNotificationReadReceipt({ dateTime: new Date(), notificationId: id, userId: activeUserId });
      await this.channelService.assignToCurrentChannel(entry, ctx);

      await this.connection.getRepository(ctx, ChannelNotificationReadReceipt).save(entry);

      // TODO customfields?

      Logger.verbose(`Marked ChannelNotification (${id}) as read by User (${activeUserId})`, loggerCtx);
    }

    await this.eventBus.publish(new ChannelNotificationEventMarkedAsRead(ctx, { ids: input.ids }));
    return { success: true };
  }
}
