import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { OrderType } from "@vendure/common/lib/generated-types";
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
  Order,
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
import { In } from "typeorm";
import { GeneratedFile } from "../config/FileStrategy";
import { SequenceSelection } from "../config/SequenceSelectionStrategy";
import {
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
import { ResolvedInvoicesOptions } from "../types";
import { assertInTransaction, forChannel } from "../utils/channel-context";
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
 * One unit of work on the plugin's queue: a single document, or a whole set.
 *
 * @category Services
 */
export type InvoiceJobData =
  | { kind: "document"; ctx: SerializedRequestContext; input: CreateInvoiceInput }
  | { kind: "documentSet"; ctx: SerializedRequestContext; input: IssueDocumentsInput };

/**
 * What {@link InvoiceService.issueDocuments} was asked to do.
 *
 * @category Services
 */
export type IssueDocumentsInput = {
  /** The order to bill. May be an aggregate, a seller or a plain order. */
  orderId: ID;

  /** Free-text reason, forwarded to every document's strategies. */
  reason?: string;

  /**
   * Skip any target that already carries a document in its channel.
   *
   * Best effort only, and explicitly **not** an idempotency key: it reads before it
   * writes without a lock, so two concurrent calls both see nothing and both issue. It
   * exists so that a *later* call can top up documents for vendors added after the fact.
   */
  skipIfAlreadyIssued?: boolean;
}

/**
 * @category Services
 */
export interface IssuedInvoiceDocument<Snapshot = any> {
  invoice: Invoice<Snapshot>;
  /** The order this document bills - the seller order, for a vendor's document. */
  order: Order;
  /** The channel it was issued in, and whose sequence it drew from. */
  channel: Channel;
}

/**
 * @category Services
 */
export interface IssuedDocumentSet<Snapshot = any> {
  /** The order the caller named, as loaded in their own channel. */
  order: Order;
  /** In the order the documents were issued, and therefore numbered. */
  documents: IssuedInvoiceDocument<Snapshot>[];
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
    private options: ResolvedInvoicesOptions<Snapshot>,
  ) { }

  private jobQueue: JobQueue<InvoiceJobData>;

  /**
   * Queues one document for asynchronous issuance.
   *
   * Nothing in this plugin calls it for you. Vendure publishes `OrderPlacedEvent` before
   * `OrderSplitter` has created a single seller order, and seller orders never publish
   * one at all, so there is no moment in the stock order lifecycle that reliably means
   * "this is billable" - which makes the timing yours to decide, not ours to guess.
   *
   * @example
   * ```ts
   * eventBus.ofType(OrderPlacedEvent).subscribe(event => {
   *   invoiceService.addToJobQueue(event.ctx, { orderId: event.order.id });
   * });
   * ```
   */
  async addToJobQueue(ctx: RequestContext, input: CreateInvoiceInput) {
    const job = await this.jobQueue.add({ kind: "document", ctx: ctx.serialize(), input });
    Logger.verbose(`Job "${job.id}" added to queue "${job.queueName}"`, loggerCtx);
    return job;
  }

  /**
   * Queues a whole document set - one per vendor on a split marketplace order - for
   * asynchronous issuance. See {@link issueDocuments}.
   */
  async addDocumentSetToJobQueue(ctx: RequestContext, input: IssueDocumentsInput) {
    const job = await this.jobQueue.add({ kind: "documentSet", ctx: ctx.serialize(), input });
    Logger.verbose(`Job "${job.id}" added to queue "${job.queueName}"`, loggerCtx);
    return job;
  }

  /**
   * Bootstrapping the plugin
   */
  async onModuleInit() {
    // TODO refund subscription for credit notes (?)
    // currently unsure how partial refunds/cancellations work exactly (?)

    this.jobQueue = await this.jobQueueService.createQueue({
      name: INVOICE_QUEUE_NAME,
      process: async (job) => {
        const ctx = RequestContext.deserialize(job.data.ctx);
        // The transaction lives here rather than inside the service methods, which assert
        // it instead of opening one. A serialized context carries no transaction, so this
        // is where a queued document gets its all-or-nothing guarantee back.
        return this.connection.withTransaction(ctx, async (txCtx) => {
          try {
            return job.data.kind === "documentSet"
              ? await this.issueDocuments(txCtx, job.data.input)
              : await this.issueDocument(txCtx, job.data.input);
          } catch (e) {
            if (e instanceof Error) {
              Logger.error(e.message, loggerCtx, e.stack);
            } else {
              Logger.error(`Unknown throw from invoice creation: ${JSON.stringify(e)}`, loggerCtx)
            }
            throw e;
          }
        });
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
   * Issues one document for one order, in the channel `ctx` points at.
   *
   * The single-document primitive. It deliberately never fans out: use
   * {@link issueDocuments} when a marketplace order needs one document per vendor.
   *
   * Must run inside a transaction, so that a failure takes the claimed sequence number
   * back with it and the range stays gapless.
   *
   * Is Channel-Aware
   */
  public async issueDocument(
    ctx: RequestContext,
    input: CreateInvoiceInput,
    relations?: RelationPaths<Invoice<Snapshot>>
  ): Promise<Invoice> {
    assertInTransaction(ctx, "issueDocument");

    const doc = await this.validateAndBuildContext(ctx, input, ctx.channel);
    return this.issueOne(ctx, doc, input, [], relations);
  }

  /**
   * Issues every document the configured {@link DocumentTargetStrategy} maps this order
   * onto, in one transaction.
   *
   * This is the multi-vendor entry point. The plugin owns *policy* - which documents
   * exist, which channel each belongs to, which sequence each draws from - and
   * *atomicity*: they all commit together, so a failure on the third vendor takes the
   * first two vendors' numbers back with it and every range stays gapless.
   *
   * The plugin deliberately does **not** own *timing*. Nothing subscribes to an event and
   * nothing fans out behind your back. Vendure publishes `OrderPlacedEvent` before
   * `OrderSplitter` has created a single seller order, and seller orders never emit one
   * at all, so there is no moment in the stock order lifecycle at which a plugin could
   * correctly do this on its own. Call this from wherever your marketplace decides
   * documents come into existence: your own `OrderSellerStrategy.afterSellerOrdersCreated`,
   * your own `OrderProcess`, an admin action.
   *
   * Must run inside a transaction; it throws rather than opening one, because opening one
   * here would quietly leave your surrounding writes uncovered by it.
   *
   * Is Channel-Aware for the lookup of `input.orderId`. The documents themselves are
   * written in whichever channels the target strategy names, which may include channels
   * the caller holds no permission on - that is the point, since the marketplace operator
   * issues on behalf of its vendors. Authorize at your call site.
   */
  public async issueDocuments(
    ctx: RequestContext,
    input: IssueDocumentsInput,
    relations?: RelationPaths<Invoice<Snapshot>>
  ): Promise<IssuedDocumentSet<Snapshot>> {
    assertInTransaction(ctx, "issueDocuments");

    // Channel-scoped, so this lookup is what proves the caller may bill this order at all.
    const order = await this.orderService.findOne(ctx, input.orderId);
    if (!order) throw new EntityNotFoundError("Order", input.orderId);

    const targets = await this.options.documentTargetStrategy.resolveTargets(ctx, order);
    if (!targets.length) {
      Logger.info(`No document targets resolved for order "${order.code}"; issuing nothing`, loggerCtx);
      return { order, documents: [] };
    }

    // Tracked across the whole set rather than per document. Storage writes take no part
    // in the transaction, so when document three throws, documents one and two have
    // already put bytes in the bucket while their rows roll back - stranding files that
    // nothing references.
    const writtenFiles: string[] = [];
    const documents: IssuedInvoiceDocument<Snapshot>[] = [];

    try {
      for (const target of targets) {
        const channelCtx = forChannel(ctx, target.channel);

        // Re-loaded through the target's own channel because a strategy is user code: it
        // could hand back an order that has nothing to do with the channel it named, and
        // this channel-scoped lookup turns that into a failure rather than a document
        // filed in the wrong vendor's books.
        const targetOrder = await this.orderService.findOne(channelCtx, target.order.id);
        if (!targetOrder)
          throw new UserInputError(
            `Order "${target.order.id}" is not visible in channel "${target.channel.code}", ` +
            `so no document can be issued for it there.`
          );

        if (input.skipIfAlreadyIssued && await this.hasInvoice(channelCtx, targetOrder.id)) {
          Logger.verbose(`Order "${targetOrder.code}" already has a document in channel "${target.channel.code}"; skipping`, loggerCtx);
          continue;
        }

        const doc: InvoiceDocumentContext = {
          kind: "invoice",
          order: targetOrder,
          channel: target.channel,
          aggregateOrder: targetOrder.aggregateOrderId
            ? await this.orderService.getAggregateOrder(channelCtx, targetOrder)
            : undefined,
          meta: target.meta,
        };

        const invoice = await this.issueOne(
          channelCtx,
          doc,
          { orderId: targetOrder.id, reason: input.reason },
          writtenFiles,
          relations,
        );

        documents.push({ invoice, order: targetOrder, channel: target.channel });
      }
    } catch (error) {
      for (const assetUrl of writtenFiles) await this.deleteQuietly(assetUrl);
      throw error;
    }

    return { order, documents };
  }

  /**
   * Validates the input and decides which kind of document it describes.
   *
   * Split out from issuance so that {@link issueDocuments} can run the issuance half once
   * per vendor while each target keeps its own validation.
   */
  private async validateAndBuildContext(
    ctx: RequestContext,
    input: CreateInvoiceInput,
    channel: Channel,
  ): Promise<InvoiceDocumentContext> {
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

    const aggregateOrder = order.aggregateOrderId
      ? await this.orderService.getAggregateOrder(ctx, order)
      : undefined;

    return invoiceToCancel
      ? { kind: "creditNote", order, channel, aggregateOrder, cancels: invoiceToCancel, reason: input.reason ?? undefined }
      : { kind: "invoice", order, channel, aggregateOrder };
  }

  /**
   * Writes one document: number, snapshot, files, row, history entry, events.
   *
   * `ctx` must already be aimed at the channel the document belongs to - the sequence
   * lookup, both strategies, the channel assignment inside {@link persistDocument} and
   * the closing re-read are all channel-scoped, and handing this the caller's context on
   * a marketplace would file the document in the wrong books or fail to find it again.
   *
   * `writtenFiles` accumulates across a whole document set; see {@link issueDocuments}.
   */
  private async issueOne(
    ctx: RequestContext,
    doc: InvoiceDocumentContext,
    input: CreateInvoiceInput,
    writtenFiles: string[],
    relations?: RelationPaths<Invoice<Snapshot>>,
  ): Promise<Invoice> {
    const invoiceToCancel = doc.kind === "creditNote" ? doc.cancels : null;

    const { sequentialId, selection } = await this.getNextSequentialId(ctx, doc);
    const snapshot = await this.options.snapshotStrategy.generate(ctx, sequentialId, doc);

    const { files } = await this.options.fileStrategy.generate(ctx, sequentialId, snapshot, doc)
    this.assertUsableFiles(sequentialId, files);

    const invoice = await this.persistDocument(ctx, {
      sequentialId: sequentialId,
      sequenceOwnerChannelId: selection.channelId,
      sequenceCode: selection.code,
      cancelsId: invoiceToCancel?.id,
      order: doc.order,
      // @ts-expect-error Generic doesnt play well with deep-partial
      snapshot,
    }, files, writtenFiles);

    await this.customFieldRelationService.updateRelations(ctx, Invoice, input, invoice);

    await this.historyService.createHistoryEntryForOrder({
      ctx,
      orderId: doc.order.id,
      type: PLUGIN_INVOICE_CREATED,
      data: {
        invoiceId: invoice.id,
        sequentialId: invoice.sequentialId,
        cancelsSequentialId: invoiceToCancel?.sequentialId,
      },
    }, false);

    Logger.verbose(`Created new Invoice(${invoice.id}) in channel "${doc.channel.code}"`, loggerCtx);

    await this.eventBus.publish(new InvoiceEvent(ctx, invoice, "created", input));
    if (invoiceToCancel)
      await this.eventBus.publish(new CreditNoteEvent(ctx, invoice, "created", input))

    // Re-read through the same channel context: the invoice lives in `doc.channel` and
    // findOne is channel-scoped, so the caller's context would come back empty here.
    return assertFound(this.findOne(ctx, { id: invoice.id }, relations));
  }

  /**
   * Whether the order already carries a document (credit notes excluded) in this channel.
   *
   * A query builder rather than a `findOne` relation filter, matching how the export
   * service joins channels: the channel condition is the only thing keeping a vendor's
   * top-up from being decided by a co-vendor's document, so it is spelled out rather than
   * left to relation-filter semantics.
   */
  private async hasInvoice(ctx: RequestContext, orderId: ID): Promise<boolean> {
    const count = await this.connection
      .getRepository(ctx, Invoice)
      .createQueryBuilder("invoice")
      .innerJoin("invoice.channels", "channel", "channel.id = :channelId", { channelId: ctx.channelId })
      .where("invoice.orderId = :orderId", { orderId })
      .andWhere("invoice.cancelsId IS NULL")
      .getCount();

    return count > 0;
  }

  /**
   * Every document issued for an order that the current channel may see.
   *
   * `includeSellerOrders` additionally walks the seller orders a marketplace order was
   * split into. Still channel-scoped, so on the default channel it gives the operator the
   * complete picture while a vendor channel sees only their own share.
   *
   * Is Channel-Aware
   */
  public async findForOrder(
    ctx: RequestContext,
    orderId: ID,
    options?: { includeSellerOrders?: boolean },
  ): Promise<Invoice<Snapshot>[]> {
    const orderIds: ID[] = [orderId];

    if (options?.includeSellerOrders) {
      const order = await this.orderService.findOne(ctx, orderId);
      if (order?.type === OrderType.Aggregate)
        for (const sellerOrder of await this.orderService.getSellerOrders(ctx, order))
          orderIds.push(sellerOrder.id);
    }

    return this.connection.getRepository(ctx, Invoice<Snapshot>).find({
      where: { orderId: In(orderIds), channels: { id: ctx.channelId } },
      order: { createdAt: "ASC" },
    });
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

    // Shared across both documents: the credit note's files are already in storage by the
    // time the replacement can fail, and a rollback does not reach into the bucket.
    const writtenFiles: string[] = [];

    let creditNote: Invoice;
    let invoice: Invoice;
    try {
      creditNote = await this.issueOne(
        ctx,
        await this.validateAndBuildContext(ctx, {
          orderId: original.orderId,
          cancels: original.id,
          reason: input.reason,
        }, ctx.channel),
        { orderId: original.orderId, cancels: original.id, reason: input.reason },
        writtenFiles,
        relations,
      );

      invoice = await this.issueOne(
        ctx,
        await this.validateAndBuildContext(ctx, { orderId: original.orderId }, ctx.channel),
        { orderId: original.orderId },
        writtenFiles,
        relations,
      );
    } catch (error) {
      for (const assetUrl of writtenFiles) await this.deleteQuietly(assetUrl);
      throw error;
    }

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
   * behind with nothing referencing it. Every asset URL is therefore appended to
   * `written`, which the caller owns: it spans a whole document set, so only the caller
   * knows whether more documents are still to come and when to sweep.
   */
  private async persistDocument(
    ctx: RequestContext,
    invoiceInput: DeepPartial<Invoice>,
    files: GeneratedFile[],
    written: string[],
  ): Promise<Invoice> {
    const defaultChannelId = (await this.channelService.getDefaultChannel(ctx)).id;
    // The default channel is always added on top: it is where the operator of a
    // marketplace works, and paperwork they cannot see is paperwork they cannot support.
    const channelIdsPerFile = files.map(file =>
      unique([...(file.channelIds ?? [ctx.channelId]), defaultChannelId]),
    );

    const rows: InvoiceFile[] = [];
    for (const [position, file] of files.entries()) {
      const assetUrl = await this.options.storageStrategy.writeFileFromBuffer(file.filename, file.buffer);
      // Recorded before anything else can fail. Storage takes no part in the transaction,
      // so a rollback leaves these bytes behind unless the caller sweeps them.
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
    doc: InvoiceDocumentContext,
  ): Promise<{ sequentialId: string; selection: SequenceSelection }> {
    // Only a doc comment before, which was survivable while every caller happened to be
    // transactional. With per-vendor contexts in play a lost transaction is the failure
    // that costs gaplessness, and on SQLite - where the row lock below is skipped - it
    // would commit silently instead of complaining.
    assertInTransaction(ctx, "getNextSequentialId");

    const selection = await this.options.sequenceSelectionStrategy.select(ctx, doc);
    const sequenceRepo = this.connection.getRepository(ctx, InvoiceSequence);
    const supportsRowLock = ROW_LOCK_COMPATIBLE_DATABASES.includes(this.connection.rawConnection.options.type);

    const findRow = () => sequenceRepo.findOne({
      where: { ownerChannelId: selection.channelId, code: selection.code },
      ...(supportsRowLock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });

    let sequenceRow = await findRow();

    if (!sequenceRow) {
      if (selection.autoCreate === false) {
        const error = new Error(
          `No InvoiceSequence for channel "${selection.channelId}" with code "${selection.code}", ` +
          `and the SequenceSelectionStrategy refused to create one.`
        );
        Logger.error(error.message, loggerCtx, error.stack);
        throw error;
      }

      Logger.warn(
        `No InvoiceSequence found for channel "${selection.channelId}" with code "${selection.code}". Creating one.`,
        loggerCtx,
      );

      const defaultChannelId = (await this.channelService.getDefaultChannel(ctx)).id;

      try {
        sequenceRow = await sequenceRepo.save(
          new InvoiceSequence({
            ownerChannelId: selection.channelId,
            code: selection.code,
            sequence: selection.initialSequence ?? this.options.initialSequence,
            // Set explicitly rather than through assignToCurrentChannel, which would use
            // `ctx.channelId`. Under a shared global counter and a per-vendor context
            // that would hand a vendor's channel the marketplace's master sequence row,
            // making it visible - and editable - to that vendor.
            channels: unique([selection.channelId, defaultChannelId]).map(id => ({ id })) as Channel[],
          })
        );
      } catch (error) {
        // Two documents of the same set can be the first ever on their channel, miss the
        // row together and both insert. The loser re-reads, this time behind the lock.
        sequenceRow = await findRow();
        if (!sequenceRow) throw error;
      }
    }

    const prefix = await this.options.prefixStrategy.generatePrefix(ctx, doc);
    const paddedSequence = sequenceRow.sequence.toString().padStart(this.options.sequenceLeftPadCount ?? 0, "0");
    sequenceRow.sequence += 1;
    await sequenceRepo.save(sequenceRow);

    return { sequentialId: `${prefix}${paddedSequence}`, selection };
  }
}
