import { InjectableStrategy, Order, RequestContext } from "@vendure/core";
import { InvoiceDocumentContext } from "../document-context";

export interface SequentialIdStrategy extends InjectableStrategy {
  /**
   * Returns the prefix for the sequential ID
   *
   * For more complex multivendor setups you should fetch all relevant information
   * through `doc.order`, like the {@link Channel}, {@link Seller}, etc.
   * But make sure to enable the per-channel-config in the Invoice-Plugin Options,
   * so that each Channel can get their own respective sequences.
   *
   * `doc` also lets you mark credit notes apart from invoices, e.g. by returning
   * `"CN-"` instead of `"INV-"`. Note that both still draw from the same underlying
   * counter, so a differing prefix alone does not give credit notes their own gapless
   * range.
   */
  generatePrefix(
    ctx: RequestContext,
    doc: InvoiceDocumentContext,
  ): Promise<string>;
}

/**
 * Simply returns the passed in prefix, for example if your invoices are not
 * scoped to a year and just contain a static prefix like `"INVOICE"`.
 */
export class StaticSequentialIdStrategy implements SequentialIdStrategy {
  readonly prefix: string = "";

  constructor(prefix?: string) {
    if (prefix) this.prefix = prefix;
  }

  async generatePrefix(ctx: RequestContext, doc: InvoiceDocumentContext): Promise<string> {
    return this.prefix;
  }
}
