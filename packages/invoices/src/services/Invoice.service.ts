import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import {
  ChannelService,
  EntityNotFoundError,
  EventBus,
  JobQueue,
  JobQueueService,
  ListQueryBuilder,
  ListQueryOptions,
  Logger,
  OrderPlacedEvent,
  OrderService,
  PaginatedList,
  RelationPaths,
  RequestContext,
  SerializedRequestContext,
  TransactionalConnection
} from "@vendure/core";
import {
  loggerCtx,
  PLUGIN_INIT_OPTIONS,
  ROW_LOCK_COMPATIBLE_DATABASES
} from "../constants";
import { CreditNote } from "../entities/CreditNote.entity";
import { Invoice } from "../entities/Invoice.entity";
import { InvoiceConfig } from "../entities/InvoiceConfig.entity";
import { CreditNoteEvent, InvoiceEvent } from "../events";
import { GetSingleInvoiceInput } from "../generated-admin-types";
import { CreateCreditNoteInput, CreateInvoiceInput, CreateInvoiceResult, InvoicesOptions, SequentialIdKind } from "../types";

/**
 * // TODO
 *
 * @category Services
 */
@Injectable()
export class InvoiceService implements OnModuleInit {
  /** @internal */
  constructor(
    private channelService: ChannelService,
    private connection: TransactionalConnection,
    private eventBus: EventBus,
    private listQueryBuilder: ListQueryBuilder,
    private jobQueueService: JobQueueService,
    private orderService: OrderService,
    @Inject(PLUGIN_INIT_OPTIONS)
    private options: InvoicesOptions,
  ) { }

  private jobQueue: JobQueue<{
    ctx: SerializedRequestContext;
    input: CreateInvoiceInput;
  }>;

  /**
   * Convenience method for adding jobs to the plugins' queue
   */
  async addToJobQueue(ctx: RequestContext, input: CreateInvoiceInput) {
    const job = await this.jobQueue.add({ ctx: ctx.serialize(), input });
    Logger.verbose(`Job "${job.id}" added to queue "${job.queueName}"`, loggerCtx);
    return job;
  }

  /**
   * Bootstrapping the plugin
   */
  async onModuleInit() {
    if (this.options.subscribeToOrderPlacedEvent) {
      this.eventBus.ofType(OrderPlacedEvent).subscribe(async (event) => {
        this.addToJobQueue(event.ctx, { orderId: event.order.id })
      });
      Logger.info("Subscribed to: OrderPlacedEvent", loggerCtx);
    } else {
      Logger.info("Did not subscribe to OrderPlacedEvent due to subscribeToOrderPlacedEvent being false", loggerCtx);
    }

    // TODO refund subscription for credit notes
    // currently unsure how partial refunds/cancellations work exactly

    this.jobQueue = await this.jobQueueService.createQueue({
      name: "plugin-invoices",
      process: async (job) => {
        const ctx = RequestContext.deserialize(job.data.ctx);
        const result = await this.connection.withTransaction(ctx,
          async (txCtx) => await this.createInvoice(txCtx, job.data.input)
        );
        return result;
      },
    });
  }

  /** 
   * Must be called inside an active transaction (ctx must carry one).
   * The `pessimistic_write` lock serialises concurrent callers: the second
   * caller blocks on `SELECT FOR UPDATE` until the first transaction commits
   * or rolls back, then reads the already-updated (or reverted) sequence.
   */
  private async getNextSequentialId(ctx: RequestContext, kind: SequentialIdKind): Promise<string> {
    const repo = this.connection.getRepository(ctx, InvoiceConfig);
    const supportsRowLock = ROW_LOCK_COMPATIBLE_DATABASES.includes(this.connection.rawConnection.options.type);
    const channelId = this.options.perChannelConfig ? ctx.channelId : (await this.channelService.getDefaultChannel(ctx)).id;
    const config = await repo.findOneOrFail({
      where: { channels: { id: channelId } },
      ...(supportsRowLock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });

    let prefix: string;
    let sequence: string;

    switch (kind) {
      case SequentialIdKind.INVOICE: {
        config.sequenceInvoice += 1;
        prefix = await this.options.invoiceIdPrefixGenerationStrategy.generate();
        sequence = config.sequenceInvoice.toString().padStart(this.options.invoiceSequenceLeftPadCount ?? 0, "0");
        break;
      }
      case SequentialIdKind.CREDIT_NOTE: {
        config.sequenceCreditNote += 1;
        prefix = await this.options.creditNoteIdPrefixGenerationStrategy.generate();
        sequence = config.sequenceCreditNote.toString().padStart(this.options.creditNoteSequenceLeftPadCount ?? 0, "0");
        break;
      }
      default:
        throw new Error("Unreachable: getNextSequentialId --> SequentialIdKind");
    }

    await repo.save(config);

    return `${prefix}${sequence}`;
  }

  // #region Find One
  /**
   * Is Channel-Aware
   */
  public async findOne(
    ctx: RequestContext,
    input: GetSingleInvoiceInput,
    relations?: RelationPaths<Invoice>
  ): Promise<Invoice | null> {
    if (!input.id && !input.sequentialId)
      throw new Error("You must specify either ID or sequential ID");

    return this.connection.getRepository(ctx, Invoice).findOne({
      where: {
        channels: { id: ctx.channelId },
        id: input.id,
        sequentialId: input.sequentialId,
      },
      relations,
    });
  }

  // #region Find All
  /**
   * Is Channel-Aware
   */
  public async findAll(
    ctx: RequestContext,
    options?: ListQueryOptions<Invoice>,
    relations?: RelationPaths<Invoice>
  ): Promise<PaginatedList<Invoice>> {
    return this.listQueryBuilder
      .build(
        Invoice,
        options,
        {
          relations,
          channelId: ctx.channelId,
          orderBy: { createdAt: options?.sort?.createdAt ?? 'DESC' },
          ctx,
        }
      )
      .getManyAndCount()
      .then(async ([items, totalItems]) => ({ items, totalItems, }));
  }

  /**
   * #TODO
   */
  public async createInvoice(ctx: RequestContext, input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const invoiceId = await this.getNextSequentialId(ctx, SequentialIdKind.INVOICE);

    // findOne scopes the query to ctx.channel, so an order from a different channel returns undefined
    const order = await this.orderService.findOne(ctx, input.orderId);
    if (!order) throw new EntityNotFoundError("Order", input.orderId);

    // TODO what about custom fields on order and orderlines?

    // TODO potentially add the snapshot to strategy param?
    const { filename, buffer } = await this.options.invoiceFileGenerationStrategy.generate(ctx, invoiceId, input.orderId)
    const assetUrl = await this.options.storageStrategy.writeFileFromBuffer(filename, buffer);
    const invoice = await this.channelService.assignToCurrentChannel(new Invoice({
      sequentialId: invoiceId,
      assetUrl,
      order,
    }), ctx);
    await this.connection.getRepository(ctx, Invoice).save(invoice);

    // TODO custom fields relations?
    await this.eventBus.publish(new InvoiceEvent(ctx, invoice, "created", input));

    return {
      invoiceId,
      assetUrl,
    };
  }

  /**
   * #TODO
   */
  public async createCreditNote(ctx: RequestContext, input: CreateCreditNoteInput): Promise<CreateInvoiceResult> {
    const sequentialId = await this.getNextSequentialId(ctx, SequentialIdKind.CREDIT_NOTE);
    // TODO potentially add the snapshot to strategy param?
    const { filename, buffer } = await this.options.invoiceFileGenerationStrategy.generate(ctx, sequentialId, input.invoiceId)
    const assetUrl = await this.options.storageStrategy.writeFileFromBuffer(filename, buffer);

    const creditNote = await this.channelService.assignToCurrentChannel(new CreditNote({
      sequentialId,
      assetUrl,
      invoice: { id: input.invoiceId },
    }), ctx);
    await this.connection.getRepository(ctx, CreditNote).save(creditNote);

    // TODO custom fields relations?
    await this.eventBus.publish(new CreditNoteEvent(ctx, creditNote, "created", input));

    return {
      invoiceId: sequentialId,
      assetUrl,
    };
  }
}
