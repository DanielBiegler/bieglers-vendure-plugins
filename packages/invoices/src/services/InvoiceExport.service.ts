import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import {
  ChannelService,
  EntityNotFoundError,
  ID,
  JobQueue,
  JobQueueService,
  ListQueryBuilder,
  ListQueryOptions,
  Logger,
  PaginatedList,
  RelationPaths,
  RequestContext,
  SerializedRequestContext,
  TransactionalConnection,
  UserInputError,
} from "@vendure/core";
import { extname } from "node:path";
import { Readable, Transform } from "node:stream";

import { In } from "typeorm";
import { DateUtils } from "typeorm/util/DateUtils";
import { Archive, ArchiveEntry } from "../config/ArchiveStrategy";
import {
  DOWNLOAD_KIND_EXPORT,
  INVOICE_DOWNLOAD_ROUTE,
  INVOICE_EXPORT_QUEUE_NAME,
  loggerCtx,
  PLUGIN_INIT_OPTIONS,
} from "../constants";
import { Invoice } from "../entities/Invoice.entity";
import { InvoiceFile } from "../entities/InvoiceFile.entity";
import { InvoiceExport } from "../entities/InvoiceExport.entity";
import { CreateInvoiceExportInput, DeletionResponse, DeletionResult } from "../generated-admin-types";
import { ResolvedInvoicesOptions } from "../types";
import { openFileStream } from "../utils/open-file-stream";
import { InvoiceDownloadSignerService } from "./DownloadSigner.service";

/** Rows pulled per page while walking a range. Keeps the working set flat. */
const INVOICE_PAGE_SIZE = 500;

/** Columns the export actually reads. Notably excludes the fat `snapshot` blob. */
type InvoiceRow = Pick<Invoice, "id" | "sequentialId" | "createdAt">;

/** The subset of an artifact the archive needs to name and open it. */
type InvoiceFileRow = Pick<InvoiceFile, "id" | "invoiceId" | "assetUrl" | "filename" | "position">;

interface ExportStats {
  /** Entries handed to the archive, i.e. excluding files that turned out to be missing. */
  added: number;
  /** Invoices visited, whether or not their files could be read. Drives the progress readout. */
  processed: number;
  missing: number;
}

/**
 * Bundles the invoices of a date range into downloadable archives.
 *
 * The whole design exists to keep memory flat in the number of invoices: rows are walked
 * a page at a time, files are opened only as the archive reaches them, and bytes go
 * straight to storage rather than accumulating in a buffer. Reading everything up front
 * would cost well over a gigabyte for a mid-sized shop's annual export.
 *
 * @category Services
 */
@Injectable()
export class InvoiceExportService implements OnModuleInit {
  /** @internal */
  constructor(
    private channelService: ChannelService,
    private connection: TransactionalConnection,
    private jobQueueService: JobQueueService,
    private listQueryBuilder: ListQueryBuilder,
    private signer: InvoiceDownloadSignerService,
    @Inject(PLUGIN_INIT_OPTIONS)
    private options: ResolvedInvoicesOptions<unknown>,
  ) { }

  private jobQueue: JobQueue<{ ctx: SerializedRequestContext; exportId: ID }>;

  async onModuleInit() {
    this.jobQueue = await this.jobQueueService.createQueue({
      name: INVOICE_EXPORT_QUEUE_NAME,
      process: async job => {
        const ctx = RequestContext.deserialize(job.data.ctx);
        return this.runExport(ctx, job.data.exportId, percent => job.setProgress(percent));
      },
    });
  }

  // #region Queries

  /**
   * Is Channel-Aware
   */
  public async findOne(
    ctx: RequestContext,
    id: ID,
    relations?: RelationPaths<InvoiceExport>,
  ): Promise<InvoiceExport | null> {
    return this.connection.getRepository(ctx, InvoiceExport).findOne({
      where: { id, channels: { id: ctx.channelId } },
      relations,
    });
  }

  /**
   * Is Channel-Aware
   */
  public async findAll(
    ctx: RequestContext,
    options?: ListQueryOptions<InvoiceExport>,
    relations?: RelationPaths<InvoiceExport>,
  ): Promise<PaginatedList<InvoiceExport>> {
    return this.listQueryBuilder
      .build(InvoiceExport, options, {
        relations,
        channelId: ctx.channelId,
        orderBy: { createdAt: options?.sort?.createdAt ?? "DESC" },
        ctx,
      })
      .getManyAndCount()
      .then(([items, totalItems]) => ({ items, totalItems }));
  }

  /**
   * How many invoices a range would export. Cheap enough to call from the UI before
   * committing to the job.
   *
   * Is Channel-Aware
   */
  public async countInRange(ctx: RequestContext, startsAt: Date, endsAt: Date): Promise<number> {
    return this.rangeQuery(ctx, startsAt, endsAt).getCount();
  }

  // #region Creating

  /**
   * Records the request and hands the actual work to the queue.
   *
   * Is Channel-Aware
   */
  public async createExport(
    ctx: RequestContext,
    input: CreateInvoiceExportInput,
  ): Promise<InvoiceExport> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()))
      throw new UserInputError("Both `startsAt` and `endsAt` must be valid dates");

    if (endsAt <= startsAt)
      throw new UserInputError("`endsAt` must lie after `startsAt`");

    // Double clicking the button would otherwise spend the same storage twice on
    // byte-identical archives.
    const inFlight = await this.connection.getRepository(ctx, InvoiceExport).findOne({
      where: {
        channels: { id: ctx.channelId },
        startsAt,
        endsAt,
        state: In(["PENDING", "RUNNING"]),
      },
    });
    if (inFlight) return inFlight;

    const record = await this.connection.getRepository(ctx, InvoiceExport).save(
      await this.channelService.assignToCurrentChannel(
        new InvoiceExport({
          startsAt,
          endsAt,
          state: "PENDING",
          createdByUserId: ctx.activeUserId ?? null,
          // TODO customfields ?
        }),
        ctx,
      ),
    );

    // TODO custom field relations 

    const job = await this.jobQueue.add({ ctx: ctx.serialize(), exportId: record.id });
    Logger.verbose(`Job "${job.id}" added to queue "${job.queueName}"`, loggerCtx);

    return record;
  }

  /**
   * Streams every invoice of the range into archives and persists them.
   *
   * Deliberately not wrapped in a transaction: it runs for minutes and writes to external
   * storage, so holding a database transaction open across it would pin a connection for
   * the duration without making the storage writes atomic anyway.
   */
  public async runExport(
    ctx: RequestContext,
    exportId: ID,
    onProgress?: (percent: number) => void,
  ): Promise<InvoiceExport> {
    const repo = this.connection.getRepository(ctx, InvoiceExport);
    const record = await this.findOne(ctx, exportId);
    if (!record) throw new EntityNotFoundError("InvoiceExport", exportId);

    await repo.update(record.id, { state: "RUNNING" });

    const total = await this.countInRange(ctx, record.startsAt, record.endsAt);
    const stats: ExportStats = { added: 0, processed: 0, missing: 0 };

    let persisted: { filename: string; assetUrl: string; fileSizeBytes: number };
    try {
      const entries = this.toArchiveEntries(ctx, record, stats, total, onProgress);
      const archive = await this.options.archiveStrategy.archive(ctx, this.basename(record), entries);
      persisted = await this.persistArchive(archive);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.error(`InvoiceExport(${record.id}) failed: ${message}`, loggerCtx);
      await repo.update(record.id, { state: "FAILED", errorMessage: message.slice(0, 255) });
      throw error;
    }

    await repo.update(record.id, {
      state: "COMPLETED",
      filename: persisted.filename,
      assetUrl: persisted.assetUrl,
      fileSizeBytes: persisted.fileSizeBytes,
      entryCount: stats.added,
      missingFileCount: stats.missing,
      errorMessage: null,
    });
    onProgress?.(100);

    Logger.info(
      `InvoiceExport(${record.id}): ${stats.added} file(s) from ${stats.processed} invoice(s)` +
      (stats.missing ? `, ${stats.missing} file(s) missing from storage` : ""),
      loggerCtx,
    );

    return (await this.findOne(ctx, record.id))!;
  }

  // #region Downloading

  /**
   * Mints a signed URL for the archive of a finished export.
   *
   * Is Channel-Aware
   */
  public async createDownloadUrl(
    ctx: RequestContext,
    exportId: ID,
    expiresIn?: number | null,
  ): Promise<string> {
    this.signer.assertEnabled();

    const record = await this.findOne(ctx, exportId);
    if (!record) throw new EntityNotFoundError("InvoiceExport", exportId);

    if (record.state !== "COMPLETED")
      throw new UserInputError(`InvoiceExport "${exportId}" is not finished yet (${record.state})`);

    return this.signer.createUrl(
      ctx,
      DOWNLOAD_KIND_EXPORT,
      String(record.id),
      `${INVOICE_DOWNLOAD_ROUTE}/exports/${record.id}/download`,
      expiresIn,
    );
  }

  public verifyDownloadSignature(
    exportId: ID,
    expires: unknown,
    signature: unknown,
  ): "valid" | "expired" | "invalid" {
    return this.signer.verify(DOWNLOAD_KIND_EXPORT, String(exportId), expires, signature);
  }

  /**
   * Deliberately *not* Channel-Aware, mirroring the single invoice download: the caller
   * arrives through a signed URL which carries no session, and that signature was minted
   * inside a channel-scoped lookup.
   */
  public async readArchiveForDownload(
    ctx: RequestContext,
    exportId: ID,
  ): Promise<{ filename: string; stream: Readable; fileSizeBytes: number; mimeType: string } | null> {
    const record = await this.connection
      .getRepository(ctx, InvoiceExport)
      .findOne({ where: { id: exportId } });
    if (!record?.assetUrl || !record.filename) return null;

    let stream: Readable;
    try {
      stream = await openFileStream(this.options.storageStrategy, record.assetUrl);
    } catch (error) {
      // The archive is gone but its record survived, e.g. because retention swept storage
      // from underneath it. Logged rather than thrown, since the caller only turns it
      // into a 404.
      Logger.warn(
        `InvoiceExport(${record.id}): could not read "${record.assetUrl}": ${String(error)}`,
        loggerCtx,
      );
      return null;
    }

    return {
      // Quotes get dropped because the value lands inside a quoted
      // Content-Disposition parameter.
      filename: record.filename.replace(/["\\]/g, ""),
      stream,
      fileSizeBytes: record.fileSizeBytes ?? 0,
      mimeType: this.options.archiveStrategy.mimeType,
    };
  }

  // #region Retention

  /**
   * Deletes one export and the archives behind it. The invoices stay untouched.
   *
   * Is Channel-Aware
   */
  public async deleteExport(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
    const record = await this.findOne(ctx, id);
    if (!record)
      return { result: DeletionResult.NOT_DELETED, message: `No invoice export with the ID "${id}"` };

    if (record.state === "RUNNING")
      return {
        result: DeletionResult.NOT_DELETED,
        message: `InvoiceExport "${id}" is still running. Wait for it to finish before deleting it.`,
      };

    if (record.assetUrl) await this.deleteQuietly(record.assetUrl);
    await this.connection.getRepository(ctx, InvoiceExport).delete(record.id);

    return { result: DeletionResult.DELETED };
  }

  /**
   * Deletes exports, and the archives behind them, older than `maxAge` **seconds**.
   *
   * Not channel-scoped on purpose: this runs from a scheduled task rather than on behalf
   * of an administrator, so every channel's stale archives should be swept.
   *
   * @param maxAge age in seconds, matching {@link InvoiceExportRetentionOptions.maxAge}
   * @returns how many exports were removed
   */
  public async pruneExpired(ctx: RequestContext, maxAge: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAge * 1000);
    const repo = this.connection.getRepository(ctx, InvoiceExport);

    const stale = await repo
      .createQueryBuilder("export")
      // Rendered the same way as the range bounds rather than passed as a raw `Date`, so
      // the comparison does not depend on how a given driver happens to serialise one.
      // A raw `Date` does work on SQLite, but `rangeQuery` already had to stop trusting
      // that, and a retention of minutes leaves no margin for an off-by-an-offset.
      .where("export.createdAt < :cutoff", { cutoff: this.toSqlBound(cutoff) })
      .getMany();

    for (const record of stale) {
      if (record.assetUrl) await this.deleteQuietly(record.assetUrl);
      await repo.delete(record.id);
    }

    if (stale.length)
      Logger.info(`Pruned ${stale.length} invoice export(s) older than ${maxAge} second(s)`, loggerCtx);

    return stale.length;
  }

  // #region Internals

  private async *toArchiveEntries(
    ctx: RequestContext,
    record: InvoiceExport,
    stats: ExportStats,
    total: number,
    onProgress?: (percent: number) => void,
  ): AsyncGenerator<ArchiveEntry> {
    for await (const invoice of this.walkRange(ctx, record.startsAt, record.endsAt)) {
      // Progress is counted per invoice rather than per file, so that it stays comparable
      // to the count `invoiceExportPreviewCount` showed before the job was started.
      stats.processed++;
      if (total > 0) onProgress?.(Math.min(99, Math.floor((stats.processed / total) * 100)));

      // Names are deduplicated per invoice rather than globally: `sequentialId` is unique,
      // so the only way two entries can collide is a strategy emitting two files that
      // share an extension.
      const used = new Set<string>();

      for (const file of await this.filesOf(ctx, invoice.id)) {
        yield {
          name: this.entryName(invoice, file, used),
          mtime: invoice.createdAt,
          open: async () => {
            try {
              // `openFileStream` rather than the strategy directly: a missing file has to
              // surface as a rejection here, or it arrives later as an `error` event on a
              // stream already handed to the archive, which both fails the whole export and
              // risks taking the process down.
              const stream = await openFileStream(this.options.storageStrategy, file.assetUrl);
              stats.added++;
              return stream;
            } catch (error) {
              // A row without its file means storage drifted away from the database, e.g. a
              // bucket lifecycle rule swept it. Aborting would throw away an otherwise
              // complete export, so the gap is counted and reported on the record instead.
              stats.missing++;
              Logger.warn(
                `Skipping InvoiceFile(${file.id}): could not read "${file.assetUrl}": ${String(error)}`,
                loggerCtx,
              );
              return null;
            }
          },
        };
      }
    }
  }

  /**
   * The artifacts of one invoice that the exporting channel is allowed to see.
   *
   * Channel-scoped rather than joined onto the invoice walk: on a marketplace order the
   * invoice spans every vendor involved, so an unscoped join would pack a co-vendor's
   * documents into this vendor's export.
   */
  private async filesOf(ctx: RequestContext, invoiceId: ID): Promise<InvoiceFileRow[]> {
    return this.connection
      .getRepository(ctx, InvoiceFile)
      .createQueryBuilder("file")
      .innerJoin("file.channels", "channel", "channel.id = :channelId", { channelId: ctx.channelId })
      .select(["file.id", "file.invoiceId", "file.assetUrl", "file.filename", "file.position"])
      .where("file.invoiceId = :invoiceId", { invoiceId })
      .orderBy("file.position", "ASC")
      .getMany();
  }

  /**
   * Walks the range a page at a time.
   *
   * `snapshot` is excluded explicitly: it is a JSON blob sized for a whole invoice, and
   * hydrating it for ten thousand rows costs hundreds of megabytes of data this code
   * never looks at.
   */
  private async *walkRange(
    ctx: RequestContext,
    startsAt: Date,
    endsAt: Date,
  ): AsyncGenerator<InvoiceRow> {
    let lastId: ID | undefined;

    while (true) {
      const query = this.rangeQuery(ctx, startsAt, endsAt)
        .select(["invoice.id", "invoice.sequentialId", "invoice.createdAt"])
        // Keyset rather than OFFSET: paging deep into a large range with OFFSET makes the
        // database re-scan everything it already skipped, on every single page.
        //
        // Keyed on `id` alone rather than on `createdAt`, because a raw date comparison
        // reintroduces exactly the driver-shape mismatch that `rangeQuery` avoids. `id` is
        // unique and totally ordered under both numeric and uuid primary keys, so the walk
        // stays exact; entries simply are not emitted in chronological order, which the
        // per-month folders in the archive make irrelevant anyway.
        .orderBy("invoice.id", "ASC")
        .take(INVOICE_PAGE_SIZE);

      if (lastId !== undefined) query.andWhere("invoice.id > :lastId", { lastId });

      const page = await query.getMany();
      if (!page.length) return;

      for (const invoice of page) yield invoice;

      lastId = page[page.length - 1].id;

      if (page.length < INVOICE_PAGE_SIZE) return;
    }
  }

  /**
   * The upper bound is **exclusive**, which is what lets back to back periods tile
   * without dropping or duplicating an invoice at the seam.
   */
  private rangeQuery(ctx: RequestContext, startsAt: Date, endsAt: Date) {
    return this.connection
      .getRepository(ctx, Invoice)
      .createQueryBuilder("invoice")
      .innerJoin("invoice.channels", "channel", "channel.id = :channelId", {
        channelId: ctx.channelId,
      })
      // Bounds are converted rather than passed as `Date`s: a raw parameter reaches the
      // driver untouched and gets serialised in a shape that need not match how the column
      // was stored, which shifts both ends of the range by the server's UTC offset and
      // silently files the first and last hours of a period into the neighbouring one.
      // Vendure's own ListQueryBuilder converts date operands the same way, see
      // https://github.com/vendurehq/vendure/issues/251
      .where("invoice.createdAt >= :startsAt", { startsAt: this.toSqlBound(startsAt) })
      .andWhere("invoice.createdAt < :endsAt", { endsAt: this.toSqlBound(endsAt) });
  }

  /**
   * Renders a range bound as the database stores its timestamps, truncated to whole
   * seconds.
   *
   * A raw `Date` parameter reaches the driver untouched and is serialised in a shape that
   * need not match the column, which shifts the range by the server's UTC offset. Vendure
   * converts date operands for the same reason, see
   * https://github.com/vendurehq/vendure/issues/251
   *
   * The truncation handles the second half of the problem. `@CreateDateColumn` on sqlite
   * falls back to a database-side `datetime('now')`, which writes `2026-08-07 13:26:34`
   * with no fractional part, while the converter emits `13:26:34.000`. Those are compared
   * as *strings*, and the shorter one sorts first, so an invoice issued in exactly that
   * second fails a `>=` against its own timestamp.
   *
   * Both bounds are truncated identically, so consecutive periods still tile exactly: the
   * end of one is the start of the next. Sub-second range boundaries are not a meaningful
   * concept for an accounting period anyway.
   */
  private toSqlBound(date: Date): string {
    return DateUtils.mixedDateToUtcDatetimeString(date).slice(0, 19);
  }

  /**
   * Counts bytes on their way past, because {@link AssetStorageStrategy} offers no way to
   * ask a stored object for its size afterwards.
   */
  private async persistArchive(
    archive: Archive,
  ): Promise<{ filename: string; assetUrl: string; fileSizeBytes: number }> {
    let fileSizeBytes = 0;
    // A Transform rather than a `data` listener on a PassThrough: the listener would flip
    // the stream into flowing mode and push bytes at the uploader regardless of whether
    // it is ready for them, defeating the backpressure the whole pipeline relies on.
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        fileSizeBytes += chunk.length;
        callback(null, chunk);
      },
    });

    // Deliberately `pipe` and not `stream/promises.pipeline`: with a Transform as its
    // terminus, pipeline resolves as soon as the *writable* side finishes and then
    // destroys the stream, throwing away whatever the uploader had not drained yet. That
    // silently truncates the archive right at its central directory, which lives at the
    // very end of a ZIP and is what makes it readable at all.
    const source = archive.stream as Readable;
    source.on("error", error => counter.destroy(error));
    source.pipe(counter);

    const write = this.options.storageStrategy.writeFileFromStream(archive.filename, counter);

    // Raced rather than simply awaited. A failed archive tears its stream down, and `pipe`
    // does not carry that through to the write stream inside the storage strategy, which
    // would then sit forever waiting for an `end` that never comes. Watching `completed`
    // alongside the write turns that hang into a rejection.
    const assetUrl = await Promise.race([
      write,
      archive.completed.then(() => write),
    ]);

    return { filename: archive.filename, assetUrl, fileSizeBytes };
  }

  /**
   * Flat `2026-01/INVOICE0042.pdf`, one entry per artifact. The month prefix is how
   * accountants file the documents, and the sequential ID rather than the strategy's own
   * filename is what makes an entry findable from a ledger.
   *
   * `used` carries the names already taken by this invoice, so a strategy emitting two
   * files of the same type still yields two distinct entries instead of silently
   * overwriting one with the other.
   */
  private entryName(invoice: InvoiceRow, file: InvoiceFileRow, used: Set<string>): string {
    const month = invoice.createdAt.toISOString().slice(0, 7);
    const extension = extname(file.filename);

    let stem = invoice.sequentialId;
    if (used.has(`${stem}${extension}`)) stem = `${stem}_${file.position}`;
    used.add(`${stem}${extension}`);

    return `${month}/${stem}${extension}`.replace(/["\\]/g, "");
  }

  private basename(record: InvoiceExport): string {
    const from = record.startsAt.toISOString().slice(0, 10);
    const to = record.endsAt.toISOString().slice(0, 10);
    return `invoices_${from}_${to}_${record.id}`;
  }

  private async deleteQuietly(assetUrl: string): Promise<void> {
    try {
      await this.options.storageStrategy.deleteFile(assetUrl);
    } catch (error) {
      Logger.warn(`Could not delete "${assetUrl}": ${String(error)}`, loggerCtx);
    }
  }
}
