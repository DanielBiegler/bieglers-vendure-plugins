import { AssetStorageStrategy } from "@vendure/core";
import { Readable } from "stream";

/**
 * Reads a file out of storage, resolving only once the stream has actually opened.
 *
 * {@link AssetStorageStrategy} offers no way to ask whether a file exists, and the local
 * strategy hands back an `fs.ReadStream` whose ENOENT arrives as an `error` event a tick
 * later, long after its promise resolved. An `error` event that nobody is listening for
 * takes the whole process down, so waiting for the stream to open here is what turns a
 * vanished file into an ordinary rejection the caller can handle.
 *
 * Nothing is consumed: the stream is handed back paused with at most one chunk buffered,
 * so the caller still controls backpressure.
 */
export async function openFileStream(
  storageStrategy: AssetStorageStrategy,
  identifier: string,
): Promise<Readable> {
  // `null` rather than the default: a strategy left to its own devices may pick a text
  // encoding (the local one uses latin1), which makes the stream emit strings. Those get
  // re-encoded as UTF-8 downstream, inflating every byte above 0x7F and corrupting any
  // file that is not plain ASCII, i.e. every real PDF.
  const stream = (await storageStrategy.readFileToStream(identifier, null)) as Readable;

  return new Promise<Readable>((resolve, reject) => {
    function cleanup() {
      stream.off("readable", onReadable);
      stream.off("end", onEnd);
      stream.off("error", onError);
    }

    // `readable` also fires at EOF, so a zero byte file resolves rather than hanging.
    function onReadable() {
      cleanup();
      resolve(stream);
    }

    function onEnd() {
      cleanup();
      resolve(stream);
    }

    function onError(error: Error) {
      cleanup();
      stream.destroy();
      reject(error);
    }

    stream.once("readable", onReadable);
    stream.once("end", onEnd);
    stream.once("error", onError);
  });
}
