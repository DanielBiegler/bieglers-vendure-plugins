import { InjectableStrategy, Order, RequestContext } from "@vendure/core";

export interface SequentialIdPrefixGenerationStrategy extends InjectableStrategy {
  /**
   * Returns the prefix for the sequential ID
   * 
   * For more complex multivendor setups you can get {@link Channel}, {@link Seller} and
   * other relevant information through the {@link Order} entity. But make sure to enable
   * the per-channel-config in the Invoice-Plugin Options, so that each Channel can get their
   * own respective sequences.
   * 
   * @example
   * ```ts
   * // Simple prefix scoped per year
   * // Note the "-" at the end of the string
   * // The generated ID will then look like this: "INVOICE-2026-00123"
   * generate(ctx: RequestContext, order: Order): Promise<string> {
   *   return `INVOICE-${new Date().getFullYear()}-`;
   * }
   * ```
   */
  generate(
    ctx: RequestContext,
    order: Order,
  ): Promise<string>;
}