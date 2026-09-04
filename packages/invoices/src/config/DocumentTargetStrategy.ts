import { Channel, InjectableStrategy, Order, RequestContext } from "@vendure/core";

/**
 * One document the plugin is being asked to issue: what it bills, and where.
 *
 * @category Strategies
 */
export interface InvoiceDocumentTarget {
  /**
   * The order to bill. On a marketplace this is normally one of the `Seller` orders that
   * {@link OrderSellerStrategy} split the customer's basket into, not the aggregate.
   */
  order: Order;

  /**
   * The {@link Channel} to issue the document in. Decides the sequence it draws from, the
   * channels the {@link Invoice} is assigned to, and the default visibility of any file
   * the {@link FileStrategy} does not scope itself.
   *
   * A separate decision from {@link order} rather than derived from it: a seller order
   * belongs to both its vendor's channel and the default channel, and Vendure collapses
   * that to the default channel alone when the vendor *is* the default channel. There is
   * no reliable way to read the intent back off the order.
   *
   * Must be a channel the order actually belongs to. The service re-loads the order
   * through this channel and refuses the target if it is not visible there, so a mistake
   * here fails rather than filing one vendor's document in another's books.
   */
  channel: Channel;

  /**
   * Forwarded verbatim to the Snapshot-, File- and SequenceSelectionStrategy as
   * `InvoiceDocumentContext.meta`. Carry whatever your marketplace knows and this plugin
   * does not, e.g. the commission split.
   */
  meta?: Record<string, unknown>;
}

/**
 * Expands "bill this order" into the concrete set of documents that has to be written.
 *
 * Deliberately kind-agnostic: it answers *where*, never *what kind*. Whether a document
 * is an invoice or a credit note is the caller's decision, which keeps credit notes and
 * reissues on the single-document path where their validation already lives.
 *
 * @category Strategies
 */
export interface DocumentTargetStrategy extends InjectableStrategy {
  resolveTargets(ctx: RequestContext, order: Order): Promise<InvoiceDocumentTarget[]>;
}

/**
 * One document, for the order you named, in the channel you asked from.
 *
 * The default, and what a single-vendor shop wants.
 *
 * @category Strategies
 */
export class SingleDocumentTargetStrategy implements DocumentTargetStrategy {
  async resolveTargets(ctx: RequestContext, order: Order): Promise<InvoiceDocumentTarget[]> {
    return [{ order, channel: ctx.channel }];
  }
}
