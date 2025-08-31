import { Inject, Injectable } from "@nestjs/common";
import {
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
  TranslatorService
} from "@vendure/core";
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

  async findOne(ctx: RequestContext, id: ID, relations?: RelationPaths<UserNotification>): Promise<UserNotification | null> {
    // TODO CHANNELAWARE

    return this.connection.getRepository(ctx, UserNotification)
      .findOne({ where: { id }, relations })
      .then(entity => entity && this.translator.translate(entity, ctx));
  }

  async findAll(
    ctx: RequestContext,
    options?: ListQueryOptions<UserNotification>,
    relations?: RelationPaths<UserNotification>): Promise<PaginatedList<UserNotification>> {
    return this.listQueryBuilder
      .build(UserNotification, options, {
        relations,
        channelId: ctx.channelId,
        orderBy: { dateTime: "DESC" },
        ctx,
      })
      .getManyAndCount()
      .then(async ([notifications, totalItems]) => {
        const items = notifications.map(n => this.translator.translate(n, ctx));
        return { items, totalItems, };
      });
  }

  async create(ctx: RequestContext, input: UserNotificationCreateInput): Promise<UserNotification> {
    const entity = await this.translatableSaver.create({
      ctx,
      input,
      entityType: UserNotification,
      translationType: UserNotificationTranslation,
      beforeSave: async entity => {
        await this.channelService.assignToCurrentChannel(entity, ctx);
        for (const tInput of input.translations) {
          const asset = tInput.idAsset ? await this.connection.getEntityOrThrow(ctx, Asset, tInput.idAsset) : null;
          const translation = entity.translations.find(t => t.languageCode === tInput.languageCode);
          if (translation) (translation as UserNotificationTranslation).asset = asset;
        }
      },
    });
    Logger.verbose(`Created UserNotification (${entity.id})`, loggerCtx);

    // TODO eventbus event
    // TODO customfields await this.customFieldRelationService.updateRelations(ctx, UserNotification, input, entity);

    const translated = this.translator.translate(entity, ctx);
    // @ts-expect-error
    if (!translated.asset) translated.asset = null;

    console.log("Translated UserNotification entity:", JSON.stringify(translated, null, 2));
    return translated;
  }

  async delete(ctx: RequestContext, ids: ID[]): Promise<DeletionResponse> {
    // TODO CHANNELAWARE
    const castedIds = ids.map(id => String(id));
    const deleteResult = await this.connection.getRepository(ctx, UserNotification).delete(castedIds);
    const result = deleteResult.affected === ids.length ? DeletionResult.DELETED : DeletionResult.NOT_DELETED;
    const message = `${deleteResult.affected} of ${ids.length} UserNotifications deleted`;
    return { result, message };
  }
}
