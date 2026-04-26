import { AssetStorageStrategy, ID } from "@vendure/core";
import { InvoiceFileGenerationStrategy } from "./config/InvoiceFileGenerationStrategy";
import { SequentialIdPrefixGenerationStrategy } from "./config/SequentialIdPrefixGenerationStrategy";

/**
 * These are the configuration options for the plugin.
 * 
 * @category Plugin
 */
export interface InvoicesOptions {
  invoiceIdPrefixGenerationStrategy: SequentialIdPrefixGenerationStrategy,
  creditNoteIdPrefixGenerationStrategy: SequentialIdPrefixGenerationStrategy,

  invoiceFileGenerationStrategy: InvoiceFileGenerationStrategy,
  creditNoteFileGenerationStrategy: InvoiceFileGenerationStrategy,
  storageStrategy: AssetStorageStrategy,

  invoiceSequenceLeftPadCount?: number,
  creditNoteSequenceLeftPadCount?: number,

  subscribeToOrderPlacedEvent?: boolean,
  subscribeToOrderCancelledEvent?: boolean,
}

export type CreateInvoiceInput = {
  orderId: ID;
}

export type CreateInvoiceResult = {
  invoiceId: string;
  assetUrl: string;
}

// In case you need customfields
//
// declare module "@vendure/core/dist/entity/custom-entity-fields" {
//   interface CustomAssetFields {
//     [CUSTOMFIELD_NAME]: string | null;
//   }
// }
