import sharp from "sharp";
import { PluginPreviewImageHashCreateInput } from "../generated-admin-types";
import { rgbaToThumbHash } from "../vendors/thumbhash";
import { PreviewImageHashBase, PreviewImageHashStrategy } from "./PreviewImageHashStrategy";

type ConstructorArgs = {
  /**
   * Will be passed into Sharp for resizing the asset before hashing. This means all
   * the default values of Sharp apply, except for `width` and `background`.
   *
   * Set only `width` OR `height` if you want to scale the second axis automatically.
   * If you set neither, `width` will become the default `64` to ensure you're not hashing the full size asset.
   *
   * Sharps `background` by default is black, but we overwrite it with white.
   *
   * @default width: 64 // Only if both `width` and `height` are undefined!
   * @default background: { r: 255, g: 255, b: 255, alpha: 1 }
   */
  resizeOptions?: sharp.ResizeOptions;

  /**
   * Used when serializing the hash into a string. Your frontend needs to know this to be able to parse it correctly.
   *
   * @default "base64"
   *
   * @example
   * ```javascript
   * // Encoding
   * Buffer.from(hash).toString("base64")
   * ```
   *
   * @example
   * ```javascript
   * // Decoding
   * Buffer.from(string, "base64")
   * ```
   */
  encoding?: BufferEncoding;
};

/**
 * A very compact representation of a placeholder for an image.
 * Store it inline with your data and show it while the real image is loading for a smoother loading experience.
 *
 * It's similar to BlurHash but with the following advantages:
 * - Encodes more detail in the same space
 * - Also encodes the aspect ratio
 * - Gives more accurate colors
 * - Supports images with alpha
 *
 * @category Strategy
 */
export class ThumbHashStrategy extends PreviewImageHashBase implements PreviewImageHashStrategy {
  constructor(args: ConstructorArgs = {}) {
    super(args);
  }

  async encode(buffer: sharp.Sharp, input: PluginPreviewImageHashCreateInput): Promise<string> {
    const resizeOptions: sharp.ResizeOptions = {
      // Clone so as to not overwrite `width` and or `height`
      ...this.resizeOptions,
      width: input.width ?? this.resizeOptions.width,
      height: input.height ?? this.resizeOptions.height,
    };

    const result = await buffer.resize(resizeOptions).raw().ensureAlpha().toBuffer({ resolveWithObject: true });

    const hash = rgbaToThumbHash(result.info.width, result.info.height, result.data);

    return Buffer.from(hash).toString(this.encoding);
  }
}
