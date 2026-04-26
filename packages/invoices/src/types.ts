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

  /**
   * By default, sequential IDs used in invoices/etc. get shared across {@link Channel}s through the default channel.
   * By setting `perChannelConfig` to `true`, each Channel **requires** their own configuration row.
   * 
   * In other words, if your Vendure instance hosts multiple distinct vendors,
   * where each vendor is one Channel, you'll want to enable this in order to
   * give every vendor their own unique, gapless invoice sequences.
   * 
   * @default false
   */
  perChannelConfig?: boolean,

  subscribeToOrderPlacedEvent?: boolean,
  subscribeToOrderCancelledEvent?: boolean,
}

export type CreateInvoiceInput = {
  orderId: ID;
}

export type CreateCreditNoteInput = {
  invoiceId: ID;
  // Order relation already exists on the invoice itself
}

export enum SequentialIdKind {
  INVOICE = "invoice",
  CREDIT_NOTE = "creditNote",
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
