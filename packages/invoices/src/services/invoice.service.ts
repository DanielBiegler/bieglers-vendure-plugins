import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import {
  EventBus,
  JobQueue,
  JobQueueService,
  Logger,
  OrderPlacedEvent,
  RequestContext,
  SerializedRequestContext,
  TransactionalConnection
} from "@vendure/core";
import {
  loggerCtx,
  PLUGIN_INIT_OPTIONS
} from "../constants";
import { Invoice } from "../entities/Invoice.entity";
import { InvoiceConfig } from "../entities/InvoiceConfig.entity";
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
    private eventBus: EventBus,
    private jobQueueService: JobQueueService,
    private connection: TransactionalConnection,
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
    // TODO think about failure cases
    this.eventBus.ofType(OrderPlacedEvent).subscribe(async (event) => {
      this.addToJobQueue(event.ctx, { orderId: event.order.id })
    });
    Logger.info("Subscribed to: OrderPlacedEvent", loggerCtx);

    // TODO refund subscription for credit notes

    // TODO type correctly
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
  private async getNextInvoiceId(ctx: RequestContext): Promise<string> {
    const prefix = await this.options.invoiceIdPrefixGenerationStrategy.generate();
    const repo = this.connection.getRepository(ctx, InvoiceConfig);

    const dbType = this.connection.rawConnection.options.type;
    /**
     * # TODO this should be thoroughly documented and mentioned in README!
     */
    const supportsRowLock = (["postgres", "aurora-postgres", "cockroachdb", "mysql", "mariadb", "aurora-mysql", "oracle"] as typeof this.connection.rawConnection.options.type[]).includes(dbType);
    const config = await repo.findOneOrFail({
      where: { channels: { id: ctx.channelId } },
      ...(supportsRowLock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });

    config.sequence += 1;
    await repo.save(config);

    const sequence = this.options.sequenceLeftPadCount
      ? config.sequence.toString().padStart(this.options.sequenceLeftPadCount, "0")
      : config.sequence;

    return `${prefix}${sequence}`;
  }

  /**
   * #TODO
   */
  public async createInvoice(ctx: RequestContext, input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const invoiceId = await this.getNextInvoiceId(ctx);
    const pdf = await this.options.pdfGenerationStrategy.generate(ctx, invoiceId, input.orderId)
    const assetUrl = await this.options.storageStrategy?.writeFileFromBuffer(invoiceId, pdf) ?? "# TODO remove once null changes";
    const invoice = new Invoice({
      invoiceId,
      assetUrl,
      channels: [ctx.channel],
    });
    await this.connection.getRepository(ctx, Invoice).save(invoice);

    // TODO custom fields relations
    // TODO add events

    return {
      invoiceId,
      assetUrl,
    };
  }
}
