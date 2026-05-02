import { InjectableStrategy, Order, RequestContext } from "@vendure/core";

export interface SequentialIdStrategy<Snapshot = any> extends InjectableStrategy {
  /**
   * Returns the prefix for the sequential ID
   * 
   * For more complex multivendor setups you should fetch all relevant information into
   * your snapshot, in addition to relevant {@link Order} fields of course.
   * But make sure to enable the per-channel-config in the Invoice-Plugin Options,
   * so that each Channel can get their own respective sequences.
   * 
   * @example
   * ```ts
   * // Simple prefix scoped per year
   * // Note the "-" at the end of the string
   * // The generated ID will then look like this: "EXAMPLE-2026-00123"
   * generatePrefix(ctx: RequestContext, snapshot: Snapshot): Promise<string> {
   *   return `EXAMPLE-${snapshot.year}-`;
   * }
   * ```
   */
  generatePrefix(
    ctx: RequestContext,
    snapshot: Snapshot,
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

  async generatePrefix(ctx: RequestContext, snapshot: any): Promise<string> {
    return this.prefix;
  }
}
