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
import { UserNotification, UserNotificationTranslation } from "../entities/user-notification.entity";
import { DeletionResponse, DeletionResult, UserNotificationCreateInput } from "../generated-admin-types";
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
  ): Promise<UserNotification> {
    const asset = input.idAsset ? await this.connection.getEntityOrThrow(ctx, Asset, input.idAsset) : null;
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

  async delete(ctx: RequestContext, ids: ID[]): Promise<DeletionResponse> {
    const castedIds = ids.map(id => String(id));
    const deleteResult = await this.connection.getRepository(ctx, UserNotification).delete({
      id: In(castedIds),
      channels: { id: ctx.channelId }
    });

    const result = deleteResult.affected === ids.length ? DeletionResult.DELETED : DeletionResult.NOT_DELETED;
    const message = `${deleteResult.affected} of ${ids.length} UserNotifications deleted`;
    return { result, message };
  }
}
