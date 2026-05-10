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
}

// In case you need customfields
//
// declare module "@vendure/core/dist/entity/custom-entity-fields" {
//   interface CustomAssetFields {
//     [CUSTOMFIELD_NAME]: string | null;
//   }
// }
