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
  DEFAULT_SEQUENCE_CODE_CREDIT,
  DEFAULT_SEQUENCE_CODE_INVOICE,
  INVOICE_QUEUE_NAME,
  loggerCtx,
  PLUGIN_INIT_OPTIONS,
  ROW_LOCK_COMPATIBLE_DATABASES
} from "../constants";
import { Invoice } from "../entities/Invoice.entity";
import { InvoiceSequence } from "../entities/Sequence.entity";
import { InvoiceEvent } from "../events";
import { GetSingleInvoiceInput } from "../generated-admin-types";
import { CreateInvoiceInput, CreateInvoiceResult, InvoicesOptions } from "../types";

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
    relations?: RelationPaths<Invoice>
  ): Promise<Invoice | null> {
    if (!input.id && !input.sequentialId)
      throw new Error("You must specify either ID or sequential ID");

    return this.connection.getRepository(ctx, Invoice).findOne({
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
    // findOne scopes the query to ctx.channel, so an order from a different channel returns undefined
    const order = await this.orderService.findOne(ctx, input.orderId);
    if (!order) throw new EntityNotFoundError("Order", input.orderId);

    // TASK(2kjlijhf)
    const sequentialId = await this.getNextSequentialId(ctx, order, DEFAULT_SEQUENCE_CODE_INVOICE);

    // TODO potentially add the snapshot to strategy param?
    // TODO what about snapshotting custom fields on order and orderlines?
    const { filename, buffer } = await this.options.invoiceFileGenerationStrategy.generate(ctx, sequentialId, input.orderId)
    const assetUrl = await this.options.storageStrategy.writeFileFromBuffer(filename, buffer);
    Logger.verbose(`Persisted file "${filename}" under "${assetUrl}"`, loggerCtx)

    const invoice = await this.connection.getRepository(ctx, Invoice).save(
      await this.channelService.assignToCurrentChannel(
        new Invoice({
          sequentialId: sequentialId,
          assetUrl,
          order,
        }),
        ctx
      )
    );
    Logger.verbose(`Created new Invoice(${invoice.id})`);

    // TODO custom fields & relations?
    await this.eventBus.publish(new InvoiceEvent(ctx, invoice, "created", input));

    return {
      invoiceId: sequentialId,
      assetUrl,
    };
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
    order: Order,
    sequenceCode: typeof DEFAULT_SEQUENCE_CODE_INVOICE | typeof DEFAULT_SEQUENCE_CODE_CREDIT,
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

    // For default use cases we lazily recover from failures
    if (!sequenceRow) {
      let initialSequence: number | undefined;
      switch (sequenceCode) {
        case DEFAULT_SEQUENCE_CODE_INVOICE: {
          initialSequence = this.options.initialInvoiceSequence;
          break;
        }
        case DEFAULT_SEQUENCE_CODE_CREDIT: {
          initialSequence = this.options.initialCreditNoteSequence;
          break;
        }
        default: {
          const error = new Error(`No InvoiceSequence found for channel "${channelId}" with code "${sequenceCode}"`);
          Logger.error(error.message, loggerCtx, error.stack);
          throw error;
        }
      }

      Logger.warn(`No InvoiceSequence found for channel "${channelId}". Creating a default row with code "${sequenceCode}"`, loggerCtx);
      const newSequence = await this.channelService.assignToCurrentChannel(
        new InvoiceSequence({
          ownerChannelId: channelId,
          code: sequenceCode,
          sequence: initialSequence,
        }),
        ctx
      );

      sequenceRow = await sequenceRepo.save(newSequence);
    }

    let prefix: string;
    let paddedSequence: string;

    switch (sequenceCode) {
      case DEFAULT_SEQUENCE_CODE_INVOICE: {
        prefix = await this.options.invoiceIdPrefixGenerationStrategy.generate(ctx, order);
        paddedSequence = sequenceRow.sequence.toString().padStart(this.options.invoiceSequenceLeftPadCount ?? 0, "0");
        break;
      }
      case DEFAULT_SEQUENCE_CODE_CREDIT: {
        prefix = await this.options.creditNoteIdPrefixGenerationStrategy.generate(ctx, order);
        paddedSequence = sequenceRow.sequence.toString().padStart(this.options.creditNoteSequenceLeftPadCount ?? 0, "0");
        break;
      }
      default: {
        throw new Error(`Unreachable - Unknown SequenceCode "${sequenceCode}" in Sequential ID generation`)
      }
    }

    sequenceRow.sequence += 1;
    await sequenceRepo.save(sequenceRow);

    return `${prefix}${paddedSequence}`;
  }
}
