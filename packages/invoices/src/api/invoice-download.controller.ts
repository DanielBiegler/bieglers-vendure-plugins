import { Controller, ForbiddenException, Get, GoneException, NotFoundException, Param, Query, Res } from "@nestjs/common";
import { Ctx, RequestContext } from "@vendure/core";
import type { Response } from "express";
import { INVOICE_DOWNLOAD_ROUTE } from "../constants";
import { InvoiceService } from "../services/Invoice.service";

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
  constructor(private service: InvoiceService) { }

  @Get(":id/download")
  async download(
    @Ctx() ctx: RequestContext,
    @Param("id") id: string,
    @Query("expires") expires: string,
    @Query("signature") signature: string,
    @Res() res: Response,
  ): Promise<void> {
    switch (this.service.verifyDownloadSignature(id, expires, signature)) {
      case "expired":
        throw new GoneException("This download link has expired");
      case "invalid":
        throw new ForbiddenException("Invalid download link");
    }

    const file = await this.service.readFileForDownload(ctx, id);
    if (!file) throw new NotFoundException(`No invoice with the ID "${id}"`);

    res.set({
      // The FileStrategy decides the actual format, so anything more specific would be a guess
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      // Signed URLs are per-recipient secrets and must not linger in shared caches
      "Cache-Control": "private, no-store",
    });

    file.stream.pipe(res);
  }
}
