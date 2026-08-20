import { InjectableStrategy, RequestContext } from "@vendure/core";
import { InvoiceDocumentContext } from "../document-context";

export type FileGenerationResult = { filename: string; buffer: Buffer };
export interface FileStrategy<Snapshot = unknown> extends InjectableStrategy {
  /**
   * Renders the document that gets persisted and handed to customers and accountants.
   *
   * Base the *contents* on `snapshot` alone, so that regenerating an old document keeps
   * producing the same bytes. `doc` is there to decide the document's shape - heading,
   * sign of the amounts, which legally required references to print - and not to read
   * order data out of, since the order is mutable.
   *
   * @returns Raw bytes of the generated file
   */
  generate(
    ctx: RequestContext,
    sequentialId: string,
    snapshot: Snapshot,
    doc: InvoiceDocumentContext,
  ): Promise<FileGenerationResult>;
}

/**
 * Simply stringifies the snapshot into a JSON file, just for debugging purposes.
 */
export class DebugFileStrategy implements FileStrategy {
  async generate(
    ctx: RequestContext,
    sequentialId: string,
    snapshot: unknown,
    doc: InvoiceDocumentContext,
  ): Promise<FileGenerationResult> {
    const filename = `${sequentialId}.json`;
    const buffer = Buffer.from(JSON.stringify(snapshot, null, 2));
    return { filename, buffer };
  }
}
