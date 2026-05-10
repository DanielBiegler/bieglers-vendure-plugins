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
  Order,
  OrderPlacedEvent,
  OrderService,
  PaginatedList,
  RelationPaths,
  RequestContext,
  SerializedRequestContext,
  TransactionalConnection
} from "@vendure/core";
import {
  DEFAULT_SEQUENCE_CODE,
  INVOICE_QUEUE_NAME,
  loggerCtx,
  PLUGIN_INIT_OPTIONS,
  ROW_LOCK_COMPATIBLE_DATABASES
} from "../constants";
import { Invoice } from "../entities/Invoice.entity";
import { InvoiceSequence } from "../entities/Sequence.entity";
import { CreditNoteEvent, InvoiceEvent } from "../events";
import { GetSingleInvoiceInput } from "../generated-admin-types";
import { CreateInvoiceInput, CreateInvoiceResult, InvoicesOptions } from "../types";

/**
 * // TODO
 *
 * @category Services
 */
@Injectable()
export class InvoiceService<Snapshot = any> implements OnModuleInit {
  /** @internal */
  constructor(
    private channelService: ChannelService,
    private connection: TransactionalConnection,
    private eventBus: EventBus,
    private listQueryBuilder: ListQueryBuilder,
    private jobQueueService: JobQueueService,
    private orderService: OrderService,
    @Inject(PLUGIN_INIT_OPTIONS)
    private options: InvoicesOptions<Snapshot>,
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

    // TODO refund subscription for credit notes (?)
    // currently unsure how partial refunds/cancellations work exactly (?)

    this.jobQueue = await this.jobQueueService.createQueue({
      name: INVOICE_QUEUE_NAME,
      process: async (job) => {
        const ctx = RequestContext.deserialize(job.data.ctx);
        const result = await this.connection.withTransaction(ctx, async (txCtx) => {
          try {
            return await this.createInvoice(txCtx, job.data.input);
          } catch (e) {
            if (e instanceof Error) {
              Logger.error(e.message, loggerCtx, e.stack);
            } else {
              Logger.error(`Unknown throw from invoice creation: ${JSON.stringify(e)}`, loggerCtx)
            }
            throw e;
          }
        });
        return result;
      },
    });
  }


  // #region Find One
  /**
   * Is Channel-Aware
   */
  public async findOne(
    ctx: RequestContext,
    input: GetSingleInvoiceInput,
    relations?: RelationPaths<Invoice<Snapshot>>
  ): Promise<Invoice<Snapshot> | null> {
    if (!input.id && !input.sequentialId)
      throw new Error("You must specify either ID or sequential ID");

    return this.connection.getRepository(ctx, Invoice<Snapshot>).findOne({
      where: {
        channels: { id: ctx.channelId },
        // TODO check if its ok to just query both
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
    options?: ListQueryOptions<Invoice<Snapshot>>,
    relations?: RelationPaths<Invoice<Snapshot>>
  ): Promise<PaginatedList<Invoice<Snapshot>>> {
    return this.listQueryBuilder
      .build(
        Invoice<Snapshot>,
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
    // findOne scopes the query to ctx.channel, so an order from a different channel returns undefined
    const order = await this.orderService.findOne(ctx, input.orderId);
    if (!order) throw new EntityNotFoundError("Order", input.orderId);

    const invoiceToCancel = input.cancels ? await this.findOne(ctx, { id: input.cancels }) : null;
    if (input.cancels && !invoiceToCancel) throw new EntityNotFoundError("Invoice", input.cancels);

    // TODO check docs for custom errors?
    // TODO can make an e2e test for this
    if (invoiceToCancel?.cancelsId)
      throw new Error(`The cancellation ID "${input.cancels}" points to a credit note. You can't cancel a cancellation.`)

    const sequentialId = await this.getNextSequentialId(ctx, DEFAULT_SEQUENCE_CODE, order);
    const snapshot = await this.options.snapshotStrategy.generate(ctx, sequentialId, order, invoiceToCancel);

    const { filename, buffer } = await this.options.fileStrategy.generate(ctx, sequentialId, snapshot)
    const assetUrl = await this.options.storageStrategy.writeFileFromBuffer(filename, buffer);
    Logger.verbose(`Persisted file "${filename}" under "${assetUrl}"`, loggerCtx)

    const invoice = await this.connection.getRepository(ctx, Invoice).save(
      await this.channelService.assignToCurrentChannel(
        new Invoice({
          sequentialId: sequentialId,
          assetUrl,
          cancelsId: invoiceToCancel?.id,
          order,
          // @ts-expect-error Generic doesnt play well with deep-partial
          snapshot,
        }),
        ctx
      )
    );
    Logger.verbose(`Created new Invoice(${invoice.id})`);

    const result: CreateInvoiceResult = {
      invoiceId: invoice.id,
      sequentialId,
      assetUrl,
    }

    await this.eventBus.publish(new InvoiceEvent(ctx, invoice, "created", result));
    if (input.cancels && invoiceToCancel)
      await this.eventBus.publish(new CreditNoteEvent(ctx, invoice, "created", result))

    return result;
  }

  /** 
 * Must be called inside an active transaction (ctx must carry one).
 * The `pessimistic_write` lock serialises concurrent callers: the second
 * caller blocks on `SELECT FOR UPDATE` until the first transaction commits
 * or rolls back, then reads the already-updated (or reverted) sequence.
 * 
 * @param sequenceCode The `code` column of an {@link InvoiceSequence}
 * 
 * Current implementation lacks support for custom plugin authors to reuse this function.
 * Lets make it work first and see then.
 */
  private async getNextSequentialId(
    ctx: RequestContext,
    sequenceCode: typeof DEFAULT_SEQUENCE_CODE | (string & {}),
    order: Order,
  ): Promise<string> {
    const sequenceRepo = this.connection.getRepository(ctx, InvoiceSequence);
    const supportsRowLock = ROW_LOCK_COMPATIBLE_DATABASES.includes(this.connection.rawConnection.options.type);
    const channelId = this.options.perChannelConfig ? ctx.channelId : (await this.channelService.getDefaultChannel(ctx)).id;

    let sequenceRow = await sequenceRepo.findOne({
      where: {
        ownerChannelId: channelId,
        code: sequenceCode,
      },
      ...(supportsRowLock ? { lock: { mode: "pessimistic_write" } } : {}),
    });

    if (!sequenceRow) {
      // For the default case we can recover lazily
      if (sequenceCode === DEFAULT_SEQUENCE_CODE) {
        Logger.warn(`No InvoiceSequence found for channel "${channelId}". Creating a default row with code "${sequenceCode}"`, loggerCtx);
        const newSequence = await this.channelService.assignToCurrentChannel(
          new InvoiceSequence({
            ownerChannelId: channelId,
            code: sequenceCode,
            sequence: this.options.initialSequence,
          }),
          ctx
        );

        sequenceRow = await sequenceRepo.save(newSequence);
      } else {
        const error = new Error(`No InvoiceSequence found for channel "${channelId}" with code "${sequenceCode}"`);
        Logger.error(error.message, loggerCtx, error.stack);
        throw error;
      }
    }

    const prefix = await this.options.prefixStrategy.generatePrefix(ctx, order);
    const paddedSequence = sequenceRow.sequence.toString().padStart(this.options.sequenceLeftPadCount ?? 0, "0");
    sequenceRow.sequence += 1;
    await sequenceRepo.save(sequenceRow);

    return `${prefix}${paddedSequence}`;
  }
}
