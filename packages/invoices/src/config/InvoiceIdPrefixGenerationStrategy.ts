import { InjectableStrategy } from "@vendure/core";

export interface InvoiceIdPrefixGenerationStrategy extends InjectableStrategy {
  /**
   * #TODO
   */
  generate(): Promise<string>;
}