import { Controller, ForbiddenException, Get, GoneException, NotFoundException, Param, Query, Res } from "@nestjs/common";
import { Ctx, Logger, RequestContext } from "@vendure/core";
import type { Response } from "express";
import { Readable } from "node:stream";
import { INVOICE_DOWNLOAD_ROUTE, loggerCtx } from "../constants";
import { InvoiceService } from "../services/Invoice.service";
import { InvoiceExportService } from "../services/InvoiceExport.service";

/**
 * Streams invoice files to whoever holds a valid signature.
 *
 * There is intentionally no `@Allow()` on the route: a route without permission
 * metadata is public in Vendure, which is what lets a browser follow the URL without
 * carrying the dashboards' session. The HMAC signature and its expiry are the
 * authorization, see {@link InvoiceService.createDownloadUrl}.
 */
@Controller(INVOICE_DOWNLOAD_ROUTE)
export class InvoiceDownloadController {
  constructor(
    private service: InvoiceService,
    private exportService: InvoiceExportService,
  ) { }

  /**
   * Declared before the single invoice route so Nest matches it first. The two cannot
   * actually collide, since `:id/download` would have to be reached by an invoice whose
   * ID is literally "exports", but relying on that would be fragile.
   */
  @Get("exports/:id/download")
  async downloadExportArchive(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
    @Query("expires") expires: string,
    @Query("signature") signature: string,
    @Res() res: Response,
  ): Promise<void> {
    switch (this.exportService.verifyDownloadSignature(id, expires, signature)) {
      case "expired":
        throw new GoneException("This download link has expired");
      case "invalid":
        throw new ForbiddenException("Invalid download link");
    }

    const file = await this.exportService.readArchiveForDownload(ctx, id);
    if (!file) throw new NotFoundException(`No finished invoice export with the ID "${id}"`);

    res.set({
      // Unlike single invoices, the ArchiveStrategy does know the format it produced
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      // Counted while writing, which is what lets a browser show progress and resume
      "Content-Length": String(file.fileSizeBytes),
      // Signed URLs are per-recipient secrets and must not linger in shared caches
      "Cache-Control": "private, no-store",
    });

    this.send(file.stream, res, `invoice export "${id}"`);
  }

  /**
   * An invoice can carry several artifacts - a PDF and its Factur-X XML, or the
   * per-vendor paperwork of a marketplace order - so the file is addressed explicitly
   * rather than guessed at. The signature covers both segments, which is what stops a
   * URL for one vendor's document from being edited into another's.
   */
  @Get(":id/download/:fileId")
  async download(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
    @Param("fileId") fileId: string,
    @Query("expires") expires: string,
    @Query("signature") signature: string,
    @Res() res: Response,
  ): Promise<void> {
    switch (this.service.verifyDownloadSignature(id, fileId, expires, signature)) {
      case "expired":
        throw new GoneException("This download link has expired");
      case "invalid":
        throw new ForbiddenException("Invalid download link");
    }

    const file = await this.service.readFileForDownload(ctx, id, fileId);
    if (!file) throw new NotFoundException(`No file "${fileId}" on invoice "${id}"`);

    res.set({
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Content-Length": String(file.fileSizeBytes),
      // Signed URLs are per-recipient secrets and must not linger in shared caches
      "Cache-Control": "private, no-store",
    });

    this.send(file.stream, res, `invoice file "${fileId}"`);
  }

  /**
   * The services already proved the file opens, so what is left here is a failure part
   * way through: a disk error, a bucket connection reset, or the client walking away.
   *
   * Both need saying out loud. An `error` event with no listener is not an exception the
   * framework catches, it is an uncaught throw that ends the process, and a read stream
   * whose reader disconnected stays open holding a file descriptor.
   */
  private send(stream: Readable, res: Response, subject: string): void {
    stream.on("error", error => {
      Logger.error(`Failed streaming ${subject}: ${String(error)}`, loggerCtx);
      // The headers went out with the first byte, so there is no status code left to
      // send. Tearing the connection down is the only way to stop a truncated file from
      // looking complete to the client.
      res.destroy(error instanceof Error ? error : new Error(String(error)));
    });

    res.on("close", () => stream.destroy());

    stream.pipe(res);
  }
}
