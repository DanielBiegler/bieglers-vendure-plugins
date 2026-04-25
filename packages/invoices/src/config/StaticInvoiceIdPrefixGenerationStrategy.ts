import { InvoiceIdPrefixGenerationStrategy } from "./InvoiceIdPrefixGenerationStrategy";

/**
 * @default "" Empty string
 */
export class StaticInvoiceIdPrefixGenerationStrategy implements InvoiceIdPrefixGenerationStrategy {
  readonly prefix: string = "";

  constructor(prefix?: string) {
    if (prefix) this.prefix = prefix;
  }

  async generate(): Promise<string> {
    return this.prefix;
  }
}
