import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { unique } from "@vendure/common/lib/unique";
import {
  assertFound,
  Channel,
  ChannelService,
  CustomFieldRelationService,
  DeepPartial,
  EntityNotFoundError,
  EventBus,
  HistoryService,
  ID,
  idsAreEqual,
  JobQueue,
  JobQueueService,
  ListQueryBuilder,
  ListQueryOptions,
  Logger,
  OrderPlacedEvent,
  OrderService,
  PaginatedList,
  patchEntity,
  RelationPaths,
  RequestContext,
  SerializedRequestContext,
  TransactionalConnection,
  UserInputError
} from "@vendure/core";
import { Readable } from "node:stream";
import { GeneratedFile } from "../config/FileStrategy";
import {
  DEFAULT_SEQUENCE_CODE,
  DOWNLOAD_KIND_INVOICE,
  INVOICE_DOWNLOAD_ROUTE,
  INVOICE_QUEUE_NAME,
  loggerCtx,
  PLUGIN_INIT_OPTIONS,
  PLUGIN_INVOICE_CREATED,
  ROW_LOCK_COMPATIBLE_DATABASES
} from "../constants";
import { InvoiceDocumentContext } from "../document-context";
import { Invoice } from "../entities/Invoice.entity";
import { InvoiceFile } from "../entities/InvoiceFile.entity";
import { InvoiceSequence } from "../entities/Sequence.entity";
import { CreditNoteEvent, InvoiceEvent } from "../events";
import { CreateInvoiceInput, GetSingleInvoiceInput, ReissueInvoiceInput, UpdateInvoiceInput } from "../generated-admin-types";
import { InvoicesOptions } from "../types";
import { openFileStream } from "../utils/open-file-stream";
import { InvoiceDownloadSignerService } from "./DownloadSigner.service";

/**
 * The two documents {@link InvoiceService.reissueInvoice} writes, in the order they were
 * issued and therefore numbered.
 *
 * @category Services
 */
export interface ReissueInvoiceResult {
  /** Cancels the original invoice in full. */
  creditNote: Invoice;
  /** Bills the order's current state. */
  invoice: Invoice;
}

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
    private signer: InvoiceDownloadSignerService,
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

    if (invoiceToCancel?.cancelsId)
      throw new UserInputError(`The cancellation ID "${input.cancels}" points to a credit note. You can't cancel a cancellation.`)

    // Without this a credit note could be booked against an unrelated order: the document
    // would credit order A's invoice while its history entry and order relation point at
    // order B, leaving both orders with a ledger that does not add up.
    if (invoiceToCancel && !idsAreEqual(invoiceToCancel.orderId, order.id))
      throw new UserInputError(
        `Invoice "${invoiceToCancel.sequentialId}" belongs to order "${invoiceToCancel.orderId}", so it cannot be cancelled by a credit note for order "${order.id}".`
      );

    const doc: InvoiceDocumentContext = invoiceToCancel
      ? { kind: "creditNote", order, cancels: invoiceToCancel, reason: input.reason ?? undefined }
      : { kind: "invoice", order };

    const sequentialId = await this.getNextSequentialId(ctx, DEFAULT_SEQUENCE_CODE, doc);
    const snapshot = await this.options.snapshotStrategy.generate(ctx, sequentialId, doc);

    const { files } = await this.options.fileStrategy.generate(ctx, sequentialId, snapshot, doc)
    this.assertUsableFiles(sequentialId, files);

    const invoice = await this.persistDocument(ctx, {
      sequentialId: sequentialId,
      cancelsId: invoiceToCancel?.id,
      order,
      // @ts-expect-error Generic doesnt play well with deep-partial
      snapshot,
    }, files);

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

  /**
   * Cancels `input.cancels` with a full-inversion credit note and immediately issues a
   * replacement invoice for the order's current state, leaving the three document trail
   * that accountants expect: original, credit note, corrected invoice.
   *
   * Both documents are written through {@link createInvoice}, so they emit the usual
   * events and order history entries. Wrap the call in a transaction (the resolver does)
   * - otherwise a failure while issuing the replacement leaves the order credited with
   * nothing to bill against. The sequence counter is claimed inside that same
   * transaction, so a rollback takes the numbers with it and stays gapless.
   *
   * The order is taken from the cancelled invoice rather than the caller, which removes
   * any chance of crediting one order and re-billing another.
   *
   * Note that nothing stops you from reissuing an invoice that was already credited; the
   * plugin does not track how much of an invoice is still outstanding. Enforce that in
   * your own code if your accounting requires it.
   *
   * Is Channel-Aware
   */
  public async reissueInvoice(
    ctx: RequestContext,
    input: ReissueInvoiceInput,
    relations?: RelationPaths<Invoice<Snapshot>>
  ): Promise<ReissueInvoiceResult> {
    const original = await this.findOne(ctx, { id: input.cancels });
    if (!original) throw new EntityNotFoundError("Invoice", input.cancels);

    if (original.cancelsId)
      throw new UserInputError(`Invoice "${original.sequentialId}" is a credit note. You can't reissue a credit note.`);

    const creditNote = await this.createInvoice(ctx, {
      orderId: original.orderId,
      cancels: original.id,
      reason: input.reason,
    }, relations);

    const invoice = await this.createInvoice(ctx, {
      orderId: original.orderId,
    }, relations);

    Logger.verbose(
      `Reissued Invoice(${original.id}) as credit note "${creditNote.sequentialId}" and invoice "${invoice.sequentialId}"`,
      loggerCtx,
    );

    return { creditNote, invoice };
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
    fileId?: ID | null,
  ): Promise<string> {
    this.signer.assertEnabled();

    const invoice = await this.findOne(ctx, { id: invoiceId });
    if (!invoice) throw new EntityNotFoundError("Invoice", invoiceId);

    const file = await this.findFile(ctx, invoice.id, fileId);
    if (!file) throw new EntityNotFoundError("InvoiceFile", fileId ?? `primary file of Invoice ${invoiceId}`);

    return this.signer.createUrl(
      ctx,
      DOWNLOAD_KIND_INVOICE,
      // Both path segments have to fold into the resource ID, otherwise a signature
      // minted for one vendor's artifact would unlock every other file of the invoice.
      `${invoice.id}:${file.id}`,
      `${INVOICE_DOWNLOAD_ROUTE}/${invoice.id}/download/${file.id}`,
      expiresIn,
    );
  }

  /**
   * Resolves the file a download refers to, defaulting to the primary one.
   *
   * Is Channel-Aware: it is the check standing between a vendor and the file IDs
   * of the co-vendors on a shared order, since the endpoint itself trusts the signature.
   */
  private async findFile(
    ctx: RequestContext,
    invoiceId: ID,
    fileId?: ID | null,
  ): Promise<InvoiceFile | null> {
    return this.connection.getRepository(ctx, InvoiceFile).findOne({
      where: {
        invoiceId,
        channels: { id: ctx.channelId },
        ...(fileId != null ? { id: fileId } : {}),
      },
      order: { position: "ASC" },
    });
  }

  /**
   * Every artifact of an invoice that the current channel may see.
   *
   * Is Channel-Aware
   */
  public async findFiles(ctx: RequestContext, invoiceId: ID): Promise<InvoiceFile[]> {
    return this.connection.getRepository(ctx, InvoiceFile).find({
      where: { invoiceId, channels: { id: ctx.channelId } },
      order: { position: "ASC" },
    });
  }

  /**
   * Recomputes the signature of a download request and reports why it is unusable,
   * so that callers can distinguish a link that merely aged out from a forged one.
   */
  public verifyDownloadSignature(
    invoiceId: ID,
    fileId: ID,
    expires: unknown,
    signature: unknown,
  ): "valid" | "expired" | "invalid" {
    return this.signer.verify(DOWNLOAD_KIND_INVOICE, `${invoiceId}:${fileId}`, expires, signature);
  }

  /**
   * Reads a file back out of the configured {@link AssetStorageStrategy}.
   *
   * Deliberately *not* Channel-Aware: callers reach this through a signed URL which
   * carries no session, and the signature was minted inside a channel-scoped lookup.
   *
   * `null` covers both "no such invoice" and "the row is there but its file is not",
   * because neither is something the caller can act on differently.
   */
  public async readFileForDownload(
    ctx: RequestContext,
    invoiceId: ID,
    fileId: ID,
  ): Promise<{ filename: string; stream: Readable; mimeType: string; fileSizeBytes: number } | null> {
    // Scoped by `invoiceId` as well as by `fileId`, so that a signature is only ever
    // honoured for the pairing it was actually minted for.
    const file = await this.connection
      .getRepository(ctx, InvoiceFile)
      .findOne({ where: { id: fileId, invoiceId } });
    if (!file) return null;

    let stream: Readable;
    try {
      stream = await openFileStream(this.options.storageStrategy, file.assetUrl);
    } catch (error) {
      // Storage drifted away from the database, e.g. a bucket lifecycle rule swept the
      // file. Logged rather than thrown, since the caller only turns it into a 404.
      Logger.warn(
        `InvoiceFile(${file.id}): could not read "${file.assetUrl}": ${String(error)}`,
        loggerCtx,
      );
      return null;
    }

    return {
      // Quotes get dropped because the value lands inside a quoted Content-Disposition
      // parameter. The stored identifier is no help here: it can be a bucket key with
      // prefixes, which is exactly why the FileStrategy names the file separately.
      filename: file.filename.replace(/["\\]/g, ""),
      stream,
      mimeType: file.mimeType ?? "application/octet-stream",
      fileSizeBytes: file.fileSizeBytes,
    };
  }

  /**
   * A FileStrategy is user supplied code, so its output gets checked rather than
   * trusted. An empty result would write an invoice nobody can download, and two files
   * sharing a name would be indistinguishable to a downloader and collide inside the
   * export archive.
   */
  private assertUsableFiles(sequentialId: string, files: GeneratedFile[]): void {
    if (!files?.length)
      throw new Error(`The FileStrategy returned no files for "${sequentialId}"`);

    const seen = new Set<string>();
    for (const file of files) {
      if (!file.filename)
        throw new Error(`The FileStrategy returned a file without a filename for "${sequentialId}"`);
      if (seen.has(file.filename))
        throw new Error(`The FileStrategy returned two files named "${file.filename}" for "${sequentialId}"`);
      seen.add(file.filename);
    }
  }

  /**
   * Writes the generated artifacts to storage, then the rows that point at them.
   *
   * Storage writes take no part in the surrounding database transaction, so a failure
   * part way through - or a rollback afterwards - would leave whatever already landed
   * behind with nothing referencing it. Everything written is therefore tracked and
   * swept before the error is rethrown.
   */
  private async persistDocument(
    ctx: RequestContext,
    invoiceInput: DeepPartial<Invoice>,
    files: GeneratedFile[],
  ): Promise<Invoice> {
    const defaultChannelId = (await this.channelService.getDefaultChannel(ctx)).id;
    // The default channel is always added on top
    const channelIdsPerFile = files.map(file =>
      unique([...(file.channelIds ?? [ctx.channelId]), defaultChannelId]),
    );

    const written: string[] = [];
    try {
      const rows: InvoiceFile[] = [];
      for (const [position, file] of files.entries()) {
        const assetUrl = await this.options.storageStrategy.writeFileFromBuffer(file.filename, file.buffer);
        written.push(assetUrl);
        Logger.verbose(`Persisted file "${file.filename}" under "${assetUrl}"`, loggerCtx);

        rows.push(new InvoiceFile({
          assetUrl,
          filename: file.filename,
          mimeType: file.mimeType ?? null,
          fileSizeBytes: file.buffer.length,
          position,
          channels: channelIdsPerFile[position].map(id => ({ id })) as Channel[],
        }));
      }

      const invoice = new Invoice(invoiceInput);
      // Goes through the service so that the ChangeChannelEvent still fires, then gets
      // widened to every channel its files reach: a vendor scoped out of the invoice
      // itself could never reach the artifact that was meant for them.
      await this.channelService.assignToCurrentChannel(invoice, ctx);
      invoice.channels = unique([
        ...invoice.channels.map(channel => channel.id),
        ...channelIdsPerFile.flat(),
      ]).map(id => ({ id })) as Channel[];

      const saved = await this.connection.getRepository(ctx, Invoice).save(invoice);

      for (const row of rows) row.invoiceId = saved.id;
      await this.connection.getRepository(ctx, InvoiceFile).save(rows);

      return saved;
    } catch (error) {
      for (const assetUrl of written) await this.deleteQuietly(assetUrl);
      throw error;
    }
  }

  /**
   * Best effort cleanup of a file whose row never made it. Failing here would replace
   * the caller's real error with a bookkeeping one, so it is only logged.
   */
  private async deleteQuietly(assetUrl: string): Promise<void> {
    try {
      await this.options.storageStrategy.deleteFile(assetUrl);
    } catch (error) {
      Logger.warn(`Could not delete orphaned file "${assetUrl}": ${String(error)}`, loggerCtx);
    }
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
    doc: InvoiceDocumentContext,
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

    const prefix = await this.options.prefixStrategy.generatePrefix(ctx, doc);
    const paddedSequence = sequenceRow.sequence.toString().padStart(this.options.sequenceLeftPadCount ?? 0, "0");
    sequenceRow.sequence += 1;
    await sequenceRepo.save(sequenceRow);

    return `${prefix}${paddedSequence}`;
  }
}
