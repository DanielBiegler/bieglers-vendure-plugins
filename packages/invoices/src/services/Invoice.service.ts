import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import {
  assertFound,
  ChannelService,
  CustomFieldRelationService,
  EntityNotFoundError,
  EventBus,
  HistoryService,
  ID,
  JobQueue,
  JobQueueService,
  ListQueryBuilder,
  ListQueryOptions,
  Logger,
  Order,
  OrderPlacedEvent,
  OrderService,
  PaginatedList,
  patchEntity,
  RelationPaths,
  RequestContext,
  SerializedRequestContext,
  TransactionalConnection
} from "@vendure/core";
import { createHmac, timingSafeEqual } from "node:crypto";
import { extname } from "node:path";
import { Stream } from "node:stream";
import {
  DEFAULT_DOWNLOAD_EXPIRES_IN,
  DEFAULT_SEQUENCE_CODE,
  DOWNLOAD_NEVER_EXPIRES,
  INVOICE_DOWNLOAD_ROUTE,
  INVOICE_QUEUE_NAME,
  loggerCtx,
  PLUGIN_INIT_OPTIONS,
  PLUGIN_INVOICE_CREATED,
  ROW_LOCK_COMPATIBLE_DATABASES
} from "../constants";
import { Invoice } from "../entities/Invoice.entity";
import { InvoiceSequence } from "../entities/Sequence.entity";
import { CreditNoteEvent, InvoiceEvent } from "../events";
import { CreateInvoiceInput, GetSingleInvoiceInput, UpdateInvoiceInput } from "../generated-admin-types";
import { InvoiceDownloadOptions, InvoicesOptions } from "../types";

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
    private customFieldRelationService: CustomFieldRelationService,
    private connection: TransactionalConnection,
    private eventBus: EventBus,
    private historyService: HistoryService,
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
  public async createInvoice(
    ctx: RequestContext,
    input: CreateInvoiceInput,
    relations?: RelationPaths<Invoice<Snapshot>>
  ): Promise<Invoice> {
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

    await this.customFieldRelationService.updateRelations(ctx, Invoice, input, invoice);

    await this.historyService.createHistoryEntryForOrder({
      ctx,
      orderId: order.id,
      type: PLUGIN_INVOICE_CREATED,
      data: {
        invoiceId: invoice.id,
        sequentialId: invoice.sequentialId,
        cancelsSequentialId: invoiceToCancel?.sequentialId,
      },
    }, false);

    Logger.verbose(`Created new Invoice(${invoice.id})`);

    await this.eventBus.publish(new InvoiceEvent(ctx, invoice, "created", input));
    if (input.cancels && invoiceToCancel)
      await this.eventBus.publish(new CreditNoteEvent(ctx, invoice, "created", input))

    return assertFound(this.findOne(ctx, { id: invoice.id }, relations));
  }

  public async updateInvoice(
    ctx: RequestContext,
    input: UpdateInvoiceInput,
    relations?: RelationPaths<Invoice<Snapshot>>
  ): Promise<Invoice> {
    const invoice = await this.findOne(ctx, { id: input.id });
    if (!invoice) throw new EntityNotFoundError("Invoice", input.id);

    await this.connection.getRepository(ctx, Invoice).save(patchEntity(invoice, input), { reload: false })
    await this.customFieldRelationService.updateRelations(ctx, Invoice, input, invoice);

    Logger.verbose(`Updated existing Invoice(${input.id})`);

    const event = invoice.cancelsId ? CreditNoteEvent : InvoiceEvent;
    await this.eventBus.publish(new event(ctx, invoice, "updated", input));

    return assertFound(this.findOne(ctx, { id: input.id }, relations));
  }

  /**
   * Creates an absolute URL which streams the invoice file through
   * {@link INVOICE_DOWNLOAD_ROUTE}. The signature *is* the authorization, so the
   * endpoint needs no session and the URL must be treated as a secret.
   *
   * Pass `expiresIn: Infinity` (or `neverExpires`) for a URL that keeps working
   * indefinitely, e.g. one you hand to the customer the invoice belongs to.
   *
   * Is Channel-Aware
   */
  public async createDownloadUrl(
    ctx: RequestContext,
    invoiceId: ID,
    expiresIn?: number | null,
  ): Promise<string> {
    const options = this.assertDownloadEnabled();

    const invoice = await this.findOne(ctx, { id: invoiceId });
    if (!invoice) throw new EntityNotFoundError("Invoice", invoiceId);

    const requested = expiresIn ?? options.defaultExpiresIn ?? DEFAULT_DOWNLOAD_EXPIRES_IN;
    // Signing the literal sentinel rather than a far future timestamp keeps a forged
    // "expires=never" from validating against a signature minted for a finite window
    const expires: number | typeof DOWNLOAD_NEVER_EXPIRES =
      Number.isFinite(requested) ? Math.floor(Date.now() / 1000) + requested : DOWNLOAD_NEVER_EXPIRES;

    const signature = this.signDownload(invoice.id, expires, options.signingSecret);
    const baseUrl = (options.baseUrl ?? this.originOfRequest(ctx)).replace(/\/+$/, "");
    const query = new URLSearchParams({ expires: String(expires), signature });

    return `${baseUrl}/${INVOICE_DOWNLOAD_ROUTE}/${invoice.id}/download?${query.toString()}`;
  }

  /**
   * Recomputes the signature of a download request and reports why it is unusable,
   * so that callers can distinguish a link that merely aged out from a forged one.
   */
  public verifyDownloadSignature(
    invoiceId: ID,
    expires: unknown,
    signature: unknown,
  ): "valid" | "expired" | "invalid" {
    const options = this.assertDownloadEnabled();

    if (typeof signature !== "string") return "invalid";

    const neverExpires = expires === DOWNLOAD_NEVER_EXPIRES;
    const expiresAt = neverExpires ? DOWNLOAD_NEVER_EXPIRES : Number(expires);
    if (!neverExpires && !Number.isSafeInteger(expiresAt)) return "invalid";

    const expected = Buffer.from(this.signDownload(invoiceId, expiresAt, options.signingSecret));
    const received = Buffer.from(signature);
    // timingSafeEqual throws on differing lengths, which would leak via the exception
    if (expected.length !== received.length) return "invalid";
    if (!timingSafeEqual(expected, received)) return "invalid";

    if (neverExpires) return "valid";

    return (expiresAt as number) < Math.floor(Date.now() / 1000) ? "expired" : "valid";
  }

  /**
   * Reads a file back out of the configured {@link AssetStorageStrategy}.
   *
   * Deliberately *not* Channel-Aware: callers reach this through a signed URL which
   * carries no session, and the signature was minted inside a channel-scoped lookup.
   */
  public async readFileForDownload(
    ctx: RequestContext,
    invoiceId: ID,
  ): Promise<{ filename: string; stream: Stream } | null> {
    const invoice = await this.connection.getRepository(ctx, Invoice).findOne({ where: { id: invoiceId } });
    if (!invoice) return null;

    const stream = await this.options.storageStrategy.readFileToStream(invoice.assetUrl);

    // The stored identifier can be a bucket key with prefixes, so the sequential ID
    // makes for a friendlier filename than its basename would. Quotes get dropped
    // because the value lands inside a quoted Content-Disposition parameter.
    const filename = `${invoice.sequentialId}${extname(invoice.assetUrl)}`.replace(/["\\]/g, "");

    return { filename, stream };
  }

  private assertDownloadEnabled(): InvoiceDownloadOptions {
    if (!this.options.download?.signingSecret) {
      const error = new Error(
        "Invoice downloads require the `download.signingSecret` option to be configured",
      );
      Logger.error(error.message, loggerCtx, error.stack);
      throw error;
    }

    return this.options.download;
  }

  private signDownload(invoiceId: ID, expires: number | typeof DOWNLOAD_NEVER_EXPIRES, secret: string): string {
    return createHmac("sha256", secret)
      .update(`${invoiceId}:${expires}`)
      .digest("base64url");
  }

  private originOfRequest(ctx: RequestContext): string {
    const req = ctx.req;
    const host = req?.get?.("host");
    if (!req || !host) {
      const error = new Error(
        "Could not derive the origin for a download URL. Configure `download.baseUrl` instead",
      );
      Logger.error(error.message, loggerCtx, error.stack);
      throw error;
    }

    return `${req.protocol}://${host}`;
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
