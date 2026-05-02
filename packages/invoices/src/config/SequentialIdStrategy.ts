import { InjectableStrategy, Order, RequestContext } from "@vendure/core";

export interface SequentialIdStrategy extends InjectableStrategy {
  /**
   * Returns the prefix for the sequential ID
   * 
   * For more complex multivendor setups you should fetch all relevant information
   * through the {@link Order}, like the {@link Channel}, {@link Seller}, etc.
   * But make sure to enable the per-channel-config in the Invoice-Plugin Options,
   * so that each Channel can get their own respective sequences.
   */
  generatePrefix(
    ctx: RequestContext,
    order: Order,
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

  async generatePrefix(ctx: RequestContext, order: Order): Promise<string> {
    return this.prefix;
  }
}
