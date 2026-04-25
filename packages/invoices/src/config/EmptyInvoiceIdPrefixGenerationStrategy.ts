import { InvoiceIdPrefixGenerationStrategy } from "./InvoiceIdPrefixGenerationStrategy";

/**
 * @default "" Empty string
 */
export class EmptyInvoiceIdPrefixGenerationStrategy implements InvoiceIdPrefixGenerationStrategy {
  async generate(): Promise<string> {
    return "";
  }
}
