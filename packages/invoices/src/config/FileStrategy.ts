import { ID, InjectableStrategy, RequestContext } from "@vendure/core";
import { InvoiceDocumentContext } from "../document-context";

/**
 * One artifact of a document, e.g. the human readable PDF or the machine readable XML
 * next to it.
 *
 * @category Strategies
 */
export interface GeneratedFile {
  /**
   * Name the file is handed to a downloader under, extension included.
   *
   * Not the storage identifier: what an {@link AssetStorageStrategy} makes of these bytes
   * is its own business, and a bucket key is rarely something you want a customer to see.
   *
   * Must be unique within one {@link FileGenerationResult}, since the download endpoint
   * and the export archive both address files by name.
   */
  filename: string;

  /** Raw bytes of the generated file. */
  buffer: Buffer;

  /**
   * Served as the `Content-Type` when the file is downloaded, e.g. `application/pdf`.
   *
   * If unset falls back to `application/octet-stream`
   */
  mimeType?: string;

  /**
   * Channels this file is visible in.
   *
   * Defaults to the channel the invoice is being created in.
   *
   * The default channel is always added on top of whatever you pass.
   */
  channelIds?: ID[];
}

/**
 * Everything one call to {@link FileStrategy.generate} produced.
 *
 * A wrapper rather than a bare array so that the result can grow fields later without
 * breaking every strategy in existence.
 *
 * @category Strategies
 */
export interface FileGenerationResult {
  /**
   * At least one file. The first one is the *primary* document: it is what a download
   * without an explicit file selector serves, and what the dashboard offers first.
   *
   * All of these belong to a single invoice and therefore share its `sequentialId`. Two
   * documents that each need their own number are two invoices, not two files.
   */
  files: GeneratedFile[];
}

export interface FileStrategy<Snapshot = unknown> extends InjectableStrategy {
  /**
   * Renders the documents that get persisted and handed to customers and accountants.
   *
   * Base the *contents* on `snapshot` alone(!) so that regenerating an old document keeps
   * producing the same bytes. `doc` is there to decide the document's shape - heading,
   * sign of the amounts, which legally required references to print.
   *
   * Returning several files is for one document in several representations, e.g. a PDF
   * with its Factur-X XML, its attachments, or the per-vendor paperwork of a marketplace
   * order. They share `sequentialId`, so anything that needs a number of its own does
   * not belong here. Scope who may see what via {@link GeneratedFile.channelIds}.
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
    return {
      files: [
        {
          filename: `${sequentialId}.json`,
          buffer: Buffer.from(JSON.stringify(snapshot, null, 2)),
          mimeType: "application/json",
        },
        {
          filename: `${sequentialId}.txt`,
          buffer: Buffer.from(`hello ${sequentialId} bruv`),
          mimeType: "text/plain",
        },
      ],
    };
  }
}
