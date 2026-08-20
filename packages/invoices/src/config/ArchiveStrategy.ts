import { InjectableStrategy, RequestContext } from "@vendure/core";
import { Stream } from "node:stream";

/**
 * One file to be placed inside an archive.
 *
 * @category Strategies
 */
export interface ArchiveEntry {
  /** Path inside the archive, e.g. `2026-01/INVOICE0042.pdf`. */
  name: string;

  /**
   * Opens the file for reading.
   *
   * Called by the strategy only once the archive is actually ready to consume the
   * bytes, never upfront. That laziness is what keeps the number of concurrently open
   * storage reads bounded: opening one stream per invoice ahead of time would park
   * thousands of in-flight responses in socket buffers and reintroduce the very memory
   * blow-up the streaming pipeline exists to avoid.
   *
   * Return `null` to omit the entry entirely, which is how a file that has since
   * vanished from storage is skipped rather than written as a confusing zero byte
   * document.
   */
  open: () => Promise<Stream | null>;

  /** Recorded as the entry's modification time. Defaults to now. */
  mtime?: Date;
}

/**
 * The archive being produced, handed over while it is still being written.
 *
 * @category Strategies
 */
export interface Archive {
  filename: string;

  /**
   * The archive's bytes.
   *
   * Must be fully consumed: the strategy only advances as this is drained, so leaving it
   * idle stalls the whole pipeline.
   */
  stream: Stream;

  /**
   * Settles once every entry has been written into {@link stream}.
   *
   * Rejects when producing the archive failed, which is the authoritative signal that
   * whatever reached storage is incomplete and has to be discarded. Watch it *alongside*
   * the consumption of `stream` rather than after it: a failure tears the stream down,
   * and a `pipe` chain does not carry that through to whatever sits at the far end.
   */
  completed: Promise<void>;
}

/**
 * Packs invoice files into a single archive.
 *
 * @category Strategies
 */
export interface ArchiveStrategy extends InjectableStrategy {
  /** Content type served for the finished archive, e.g. `application/zip`. */
  readonly mimeType: string;

  /**
   * Starts building the archive.
   *
   * Resolves as soon as {@link Archive.stream} is available, **not** when the archive is
   * finished. Waiting for completion before draining would deadlock, because the bytes
   * only move as the consumer pulls them; {@link Archive.completed} is what reports the
   * finish.
   *
   * @param basename Filename stem without extension, e.g. `invoices-2026-01-01_2026-02-01`
   */
  archive(
    ctx: RequestContext,
    basename: string,
    entries: AsyncIterable<ArchiveEntry>,
  ): Promise<Archive>;
}
