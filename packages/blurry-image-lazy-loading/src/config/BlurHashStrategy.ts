import sharp from "sharp";
import { PluginPreviewImageHashCreateInput } from "../generated-admin-types";
import { encode as encodeBlurhash } from "../vendors/blurhash";
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

  /**
   * Must be between (inclusive) 1-9
   *
   * More components will result in more detail, but increase the hash length.
   *
   * @throws `encode` will throw if this number is not between 1-9
   * @default 4
   */
  componentX?: number;

  /**
   * Must be between (inclusive) 1-9
   *
   * More components will result in more detail, but increase the hash length.
   *
   * @throws `encode` will throw if this number is not between 1-9
   * @default 3
   */
  componentY?: number;
};

/**
 * A very compact representation of a placeholder for an image.
 * Store it inline with your data and show it while the real image is loading for a smoother loading experience.
 *
 * @category Strategy
 */
export class BlurHashStrategy extends PreviewImageHashBase implements PreviewImageHashStrategy {
  constructor(args: ConstructorArgs = {}) {
    super(args);

    this.componentX = args.componentX ?? 4;
    this.componentY = args.componentY ?? 3;
  }

  private componentX: number;
  private componentY: number;

  async encode(buffer: sharp.Sharp, input: PluginPreviewImageHashCreateInput): Promise<string> {
    const resizeOptions: sharp.ResizeOptions = {
      // Clone so as to not overwrite `width` and or `height`
      ...this.resizeOptions,
      width: input.width ?? this.resizeOptions.width,
      height: input.height ?? this.resizeOptions.height,
    };

    const result = await buffer.resize(resizeOptions).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const clampedArray = Uint8ClampedArray.from(result.data);
    const hash = encodeBlurhash(clampedArray, result.info.width, result.info.height, this.componentX, this.componentY);

    // TODO might be useful to rewrite blurhash argument to buffer instead of clamped array so we dont have to reallocate

    return Buffer.from(hash).toString(this.encoding);
  }
}
