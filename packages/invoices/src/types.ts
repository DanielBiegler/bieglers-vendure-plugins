import { AssetStorageStrategy } from "@vendure/core";
import { FileStrategy } from "./config/FileStrategy";
import { SequentialIdStrategy } from "./config/SequentialIdStrategy";
import { SnapshotStrategy } from "./config/SnapshotStrategy";

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
   * By default, sequential IDs used in invoices/etc. get shared across {@link Channel}s
   * through the default channel. By setting `perChannelConfig` to `true`, each Channel
   * **requires** their own configuration row.
   * 
   * In other words, if your Vendure instance hosts multiple distinct vendors,
   * where each vendor is one Channel, you'll want to enable this in order to
   * give every vendor their own unique, gapless invoice sequences.
   * 
   * @default false
   */
  perChannelConfig?: boolean,

  subscribeToOrderPlacedEvent?: boolean,

  /**
   * Enables the `createInvoiceDownloadUrl` mutation and the endpoint it points at.
   * Without it, both refuse to work.
   *
   * Files have to be streamed through your instance, because a
   * {@link AssetStorageStrategy} identifier is opaque: it may be a filesystem path
   * or a bucket key and is not necessarily reachable by a browser at all.
   */
  download?: InvoiceDownloadOptions,
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
