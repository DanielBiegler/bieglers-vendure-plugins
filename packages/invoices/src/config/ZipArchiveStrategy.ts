import { RequestContext } from "@vendure/core";
import { Readable } from "node:stream";
import { ZipFile } from "yazl";
import { Archive, ArchiveEntry, ArchiveStrategy } from "./ArchiveStrategy";

/**
 * @category Strategies
 */
export interface ZipArchiveOptions {
  /**
   * Deflates entries instead of storing them verbatim.
   *
   * Off by default because PDF content streams are already Flate compressed: re-deflating
   * an archive of them typically buys 2-5%. The cost is not just CPU, it is *which* CPU —
   * Node runs `zlib` on the libuv threadpool, which `fs` shares, so a compressing export
   * can starve concurrent asset reads across the entire process.
   *
   * Worth turning on if your `FileStrategy` emits something genuinely compressible, e.g.
   * XML invoices.
   *
   * @default false
   */
  compress?: boolean;

  /**
   * How many storage reads may be open at once.
   *
   * Exists purely to hide round-trip latency: fetching 10.000 objects from S3 strictly
   * one after another spends minutes doing nothing but waiting. Raising it trades peak
   * memory (roughly `readAhead × filesize`) for throughput.
   *
   * @default 4
   */
  readAhead?: number;
}

const DEFAULT_READ_AHEAD = 4;
const DEFAULT_COMPRESS = false;

/**
 * Default {@link ArchiveStrategy}, producing a ZIP archive via
 * [yazl](https://github.com/thejoshwolfe/yazl).
 *
 * Memory stays flat in the number of invoices: entries are pulled one at a time, source
 * files are opened only as yazl reaches them, and bytes leave for storage as they are
 * produced rather than accumulating in a buffer.
 *
 * Size is not a concern worth designing around: yazl switches to ZIP64 on its own past
 * 65.535 entries or 4GB, so one archive stays valid at any volume a shop is realistically
 * going to download by hand.
 *
 * @category Strategies
 */
export class ZipArchiveStrategy implements ArchiveStrategy {
  readonly mimeType = "application/zip";

  constructor(private options: ZipArchiveOptions = {}) { }

  async archive(
    ctx: RequestContext,
    basename: string,
    entries: AsyncIterable<ArchiveEntry>,
  ): Promise<Archive> {
    const zip = new ZipFile();

    const completed = this.feed(zip, entries).catch(error => {
      // Tearing the stream down is what makes the consumer's write fail rather than
      // quietly persist a truncated archive as if it were complete.
      (zip.outputStream as Readable).destroy(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    });

    // Marks `completed` as handled. Without it a failure occurring before the consumer
    // gets around to awaiting it would surface as an unhandled rejection.
    completed.catch(() => undefined);

    return { filename: `${basename}.zip`, stream: zip.outputStream, completed };
  }

  private async feed(zip: ZipFile, entries: AsyncIterable<ArchiveEntry>): Promise<void> {
    const readAhead = Math.max(1, this.options.readAhead ?? DEFAULT_READ_AHEAD);
    const compress = this.options.compress ?? DEFAULT_COMPRESS;
    const pending: Array<Promise<void>> = [];
    let sourceError: unknown;

    for await (const entry of entries) {
      if (pending.length >= readAhead) await pending.shift();
      if (sourceError) throw sourceError;

      const source = await entry.open();
      if (!source) continue;

      // Listeners are attached before yazl gets the stream, so no event can be missed.
      // yazl pumps strictly one entry at a time, which makes "this source ended" the
      // signal that it has moved on and another may be opened.
      pending.push(new Promise<void>(resolve => {
        source.once("end", () => resolve());
        source.once("error", (error: unknown) => {
          sourceError ??= error;
          resolve();
        });
      }));

      zip.addReadStream(source as NodeJS.ReadableStream, entry.name, {
        compress,
        mtime: entry.mtime ?? new Date(),
      });
    }

    zip.end();

    while (pending.length) await pending.shift();
    if (sourceError) throw sourceError;
  }
}
