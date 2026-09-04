import { Channel, Order } from "@vendure/core";
import { Invoice } from "./entities/Invoice.entity";

/**
 * Describes *which* document is being issued, so that strategies can branch on it.
 *
 * Invoices and credit notes share one entity, one sequence and one storage path, which
 * means the only thing telling them apart at generation time is this context. Without it
 * a {@link FileStrategy} cannot know whether to render "Invoice" or "Credit note", nor
 * that the amounts belong on the document with an inverted sign.
 *
 * A discriminated union rather than an `isCreditNote: boolean`, because the fields that
 * only a credit note has ({@link CreditNoteDocument.cancels}) are then non-optional
 * exactly where they exist, and `switch (doc.kind)` narrows without casts.
 *
 * @category Strategies
 */
export type InvoiceDocumentContext =
  | InvoiceDocument
  | CreditNoteDocument;

/**
 * What every document carries, whatever its kind.
 *
 * @category Strategies
 */
export interface InvoiceDocumentBase {
  /** The order being billed. */
  order: Order;

  /**
   * The {@link Channel} this document is issued in, i.e. whose books it belongs to and
   * whose sequence it draws from.
   *
   * Stated explicitly rather than left for strategies to infer from `ctx`, because on a
   * marketplace order the answer is neither the channel the request arrived in nor
   * something derivable from `order`: a seller order carries both its vendor's channel
   * and the default channel, and Vendure drops the former entirely when the vendor *is*
   * the default channel. Read the channel from here.
   */
  channel: Channel;

  /**
   * Set when {@link order} is a seller order, i.e. one share of a split marketplace
   * order: the aggregate it was split from.
   *
   * Usually what a document actually needs to print. The customer's address, the order
   * code the customer knows, and the storefront channel you may want to add to
   * {@link GeneratedFile.channelIds} so the buyer can reach their copy all live on the
   * aggregate and on none of the seller orders.
   */
  aggregateOrder?: Order;

  /**
   * Whatever {@link InvoiceDocumentTarget.meta} the target carried, forwarded verbatim.
   *
   * The escape hatch for everything your marketplace knows and this plugin does not, e.g.
   * the commission split or the Seller entity behind the channel.
   */
  meta?: Record<string, unknown>;
}

/**
 * A regular invoice, i.e. the order is being billed for the first time, or re-billed
 * after a correction.
 *
 * @category Strategies
 */
export interface InvoiceDocument extends InvoiceDocumentBase {
  kind: "invoice";
}

/**
 * A credit note, i.e. a document crediting the customer against an already issued
 * invoice. Known as "credit memo" or "Stornorechnung"/"Rechnungskorrektur" depending on
 * where you file your taxes.
 *
 * @category Strategies
 */
export interface CreditNoteDocument extends InvoiceDocumentBase {
  kind: "creditNote";

  /**
   * The invoice being credited. Guaranteed to be a plain invoice rather than another
   * credit note, and to belong to {@link order} - the service enforces both before any
   * strategy runs.
   *
   * Read the amounts to credit off `cancels.snapshot` rather than off {@link order}: the
   * order is mutable and by the time a correction happens it generally no longer reflects
   * what the original invoice actually billed.
   */
  cancels: Invoice;

  /**
   * Free-text reason, passed straight through from the caller.
   *
   * Deliberately not a column on the entity: the snapshot is the immutable record, so
   * capture it there from your `SnapshotStrategy` if the document needs to show it.
   */
  reason?: string;
}

/**
 * Narrows to {@link CreditNoteDocument}, for call sites where a `switch` would be noise.
 *
 * @category Strategies
 */
export function isCreditNoteDocument(
  doc: InvoiceDocumentContext,
): doc is CreditNoteDocument {
  return doc.kind === "creditNote";
}
