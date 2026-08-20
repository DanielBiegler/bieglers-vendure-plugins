import { Inject, Injectable } from "@nestjs/common";
import { Logger, RequestContext } from "@vendure/core";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_DOWNLOAD_EXPIRES_IN,
  DOWNLOAD_NEVER_EXPIRES,
  DownloadKind,
  loggerCtx,
  PLUGIN_INIT_OPTIONS,
} from "../constants";
import { InvoiceDownloadOptions, ResolvedInvoicesOptions } from "../types";

/**
 * Mints and validates the signatures that authorize the download endpoints.
 *
 * Every signed resource in this plugin goes through here so that the {@link DownloadKind}
 * namespacing cannot be forgotten at a call site: a signature minted for one kind of
 * resource must never validate for another, even when both happen to carry the same
 * numeric ID.
 *
 * @category Services
 */
@Injectable()
export class InvoiceDownloadSignerService {
  /** @internal */
  constructor(
    @Inject(PLUGIN_INIT_OPTIONS)
    private options: ResolvedInvoicesOptions<unknown>,
  ) { }

  /**
   * Builds the absolute, signed URL for `path`. The signature *is* the authorization,
   * so the endpoint needs no session and the URL must be treated as a secret.
   *
   * `resourceId` has to identify the resource as precisely as the route does. A route
   * that addresses one file out of several (e.g. an archive volume) must therefore fold
   * every one of those path segments into it, otherwise a signature for volume 0
   * unlocks volume 7 as well.
   */
  createUrl(
    ctx: RequestContext,
    kind: DownloadKind,
    resourceId: string,
    path: string,
    expiresIn?: number | null,
  ): string {
    const options = this.assertEnabled();

    const requested = expiresIn ?? options.defaultExpiresIn ?? DEFAULT_DOWNLOAD_EXPIRES_IN;
    // Signing the literal sentinel rather than a far future timestamp keeps a forged
    // "expires=never" from validating against a signature minted for a finite window
    const expires: number | typeof DOWNLOAD_NEVER_EXPIRES =
      Number.isFinite(requested) ? Math.floor(Date.now() / 1000) + requested : DOWNLOAD_NEVER_EXPIRES;

    const signature = this.sign(kind, resourceId, expires, options.signingSecret);
    const baseUrl = (options.baseUrl ?? this.originOfRequest(ctx)).replace(/\/+$/, "");
    const query = new URLSearchParams({ expires: String(expires), signature });

    return `${baseUrl}/${path.replace(/^\/+/, "")}?${query.toString()}`;
  }

  /**
   * Recomputes the signature of a download request and reports why it is unusable,
   * so that callers can distinguish a link that merely aged out from a forged one.
   */
  verify(
    kind: DownloadKind,
    resourceId: string,
    expires: unknown,
    signature: unknown,
  ): "valid" | "expired" | "invalid" {
    const options = this.assertEnabled();

    if (typeof signature !== "string") return "invalid";

    const neverExpires = expires === DOWNLOAD_NEVER_EXPIRES;
    const expiresAt = neverExpires ? DOWNLOAD_NEVER_EXPIRES : Number(expires);
    if (!neverExpires && !Number.isSafeInteger(expiresAt)) return "invalid";

    const expected = Buffer.from(this.sign(kind, resourceId, expiresAt, options.signingSecret));
    const received = Buffer.from(signature);
    // timingSafeEqual throws on differing lengths, which would leak via the exception
    if (expected.length !== received.length) return "invalid";
    if (!timingSafeEqual(expected, received)) return "invalid";

    if (neverExpires) return "valid";

    return (expiresAt as number) < Math.floor(Date.now() / 1000) ? "expired" : "valid";
  }

  assertEnabled(): InvoiceDownloadOptions {
    if (!this.options.download?.signingSecret) {
      const error = new Error(
        "Invoice downloads require the `download.signingSecret` option to be configured",
      );
      Logger.error(error.message, loggerCtx, error.stack);
      throw error;
    }

    return this.options.download;
  }

  private sign(
    kind: DownloadKind,
    resourceId: string,
    expires: number | typeof DOWNLOAD_NEVER_EXPIRES,
    secret: string,
  ): string {
    return createHmac("sha256", secret)
      .update(`${kind}:${resourceId}:${expires}`)
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
}
