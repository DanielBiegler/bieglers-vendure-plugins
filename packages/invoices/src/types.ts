import { AssetStorageStrategy, ID } from "@vendure/core";
import { ArchiveStrategy } from "./config/ArchiveStrategy";
import { DocumentTargetStrategy } from "./config/DocumentTargetStrategy";
import { FileStrategy } from "./config/FileStrategy";
import { SequenceSelectionStrategy } from "./config/SequenceSelectionStrategy";
import { SequentialIdStrategy } from "./config/SequentialIdStrategy";
import { SnapshotStrategy } from "./config/SnapshotStrategy";
import { PLUGIN_INVOICE_CREATED } from "./constants";

declare module "@vendure/core" {
  interface OrderHistoryEntryData {
    [PLUGIN_INVOICE_CREATED]: {
      invoiceId: ID;
      sequentialId: string;
      /** Set when the document cancels an earlier invoice, i.e. when it is a credit note. */
      cancelsSequentialId?: string;
    };
  }
}

/**
 * These are the configuration options for the plugin.
 * 
 * @category Plugin
 */
export interface InvoicesOptions<Snapshot = unknown> {
  prefixStrategy: SequentialIdStrategy,
  snapshotStrategy: SnapshotStrategy<Snapshot>,
  fileStrategy: FileStrategy<Snapshot>,

  /**
   * Expands "bill this order" into the set of documents that has to be written, and the
   * channel each belongs to.
   *
   * Set {@link PerSellerOrderTargetStrategy} for a multi-vendor marketplace, where one
   * order spanning three vendors needs three separately numbered documents.
   *
   * @default new SingleDocumentTargetStrategy() i.e. one document, in the current channel
   */
  documentTargetStrategy?: DocumentTargetStrategy,

  /**
   * Decides which {@link InvoiceSequence} a document draws its number from.
   *
   * Use `scope: "channel"` alongside a per-seller {@link documentTargetStrategy}, so each
   * vendor gets a range that is gapless in their own books.
   *
   * @default new DefaultSequenceSelectionStrategy() i.e. one shared counter
   */
  sequenceSelectionStrategy?: SequenceSelectionStrategy,

  /**
   * Used to persist, check and read generated files.
   * 
   * You decide whether or not your invoices are publically readable,
   * but this should be taken into careful consideration. Be cautious to not
   * expose all your invoices in an easily enumerable, public bucket.
   */
  storageStrategy: AssetStorageStrategy,

  /** If defined, left-pads the sequence with zeroes. */
  sequenceLeftPadCount?: number,

  /** Starting value for the invoice sequence when a config is auto-created. @default 1 */
  initialSequence?: number,

  /**
   * Enables the `createInvoiceDownloadUrl` mutation and the endpoint it points at.
   * Without it, both refuse to work.
   *
   * Files have to be streamed through your instance, because a
   * {@link AssetStorageStrategy} identifier is opaque: it may be a filesystem path
   * or a bucket key and is not necessarily reachable by a browser at all.
   */
  download?: InvoiceDownloadOptions,

  /**
   * Packs bulk exports into archives.
   *
   * @default new ZipArchiveStrategy() i.e. a single, uncompressed ZIP file
   */
  archiveStrategy?: ArchiveStrategy,

  /**
   * Deletes finished exports after a while.
   *
   * Off by default.
   */
  exportRetention?: InvoiceExportRetentionOptions,
}

/**
 * {@link InvoicesOptions} after {@link InvoicesPlugin.init} has filled in the defaults.
 *
 * Only what gets injected as `PLUGIN_INIT_OPTIONS` sees this shape, so that internal code
 * does not have to re-assert an optional that is in fact always present by then.
 *
 * @category Plugin
 */
export type ResolvedInvoicesOptions<Snapshot = unknown> =
  Omit<InvoicesOptions<Snapshot>, "archiveStrategy" | "documentTargetStrategy" | "sequenceSelectionStrategy">
  & {
    archiveStrategy: ArchiveStrategy;
    documentTargetStrategy: DocumentTargetStrategy;
    sequenceSelectionStrategy: SequenceSelectionStrategy;
  };

/**
 * @category Plugin
 */
export interface InvoiceExportRetentionOptions {
  /**
   * Age **in seconds** past which an export gets deleted, along with its archive. The
   * invoices themselves are never touched.
   *
   * @example
   * ```ts
   * maxAge: 60 * 60 * 24 * 30, // 30 days
   * ```
   */
  maxAge: number,

  /**
   * Cron expression deciding how often the sweep runs.
   *
   * @default "0 3 * * *" (daily at 03:00)
   */
  schedule?: string,
}

/**
 * @category Plugin
 */
export interface InvoiceDownloadOptions {
  /**
   * Signs download URLs via HMAC-SHA256. Treat it like a password, i.e. read it from
   * the environment and keep it out of version control.
   *
   * Rotating it invalidates every URL that is still in flight, which is the
   * emergency brake in case one leaked.
   */
  signingSecret: string,

  /**
   * Absolute origin that URLs get built from, e.g. `https://api.example.com`.
   *
   * Defaults to the origin of the request that asked for the URL. That guess is wrong
   * when your instance sits behind a proxy which doesn't set `X-Forwarded-*` headers,
   * or when Express isn't configured to trust them, hence this escape hatch.
   */
  baseUrl?: string,

  /**
   * Validity in seconds, used when the caller doesn't request a specific one.
   *
   * Anyone holding the URL can download the file until it expires, so a long lived
   * one is effectively a public link. Keep it as short as your clients tolerate.
   *
   * `Infinity` mints URLs that never expire. Be aware that the only way to retract
   * such a URL afterwards is rotating {@link signingSecret}, which kills *every*
   * URL you ever handed out. Short durations are much preferred but if you don't care
   * the option is there.
   *
   * @default 300
   */
  defaultExpiresIn?: number,
}

// In case you need customfields
//
// declare module "@vendure/core/dist/entity/custom-entity-fields" {
//   interface CustomAssetFields {
//     [CUSTOMFIELD_NAME]: string | null;
//   }
// }
