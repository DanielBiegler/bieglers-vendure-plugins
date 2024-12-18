import sharp from "sharp";
import { PluginPreviewImageHashCreateInput } from "../generated-admin-types";

/**
 * @category Strategy
 */
export interface PreviewImageHashStrategy {
  /**
   * Generates the image hash
   *
   * WARNING: This function mutates the sharp object!
   *
   * @returns Preview Hash
   */
  encode(buffer: sharp.Sharp, input: PluginPreviewImageHashCreateInput): Promise<string>;
}

/**
 * @category Strategy
 */
export type PreviewImageHashBaseArgs = {
  resizeOptions?: sharp.ResizeOptions;
  encoding?: BufferEncoding;
};

/**
 * Shared logic and values to reduce the boilerplate inside strategies
 *
 * @category Strategy
 */
export abstract class PreviewImageHashBase {
  default = {
    width: 64,
    background: { r: 255, g: 255, b: 255, alpha: 1 } as const satisfies sharp.Color,
    encoding: "base64" satisfies BufferEncoding,
  } as const;

  resizeOptions: sharp.ResizeOptions;
  encoding: BufferEncoding;

  /**
   * Clones the resize options so as to not mutate the passed in object.
   * @see args.resizeOptions
   */
  constructor(args: PreviewImageHashBaseArgs) {
    this.resizeOptions = {
      ...args.resizeOptions,
      // By default scale by width
      width:
        args.resizeOptions?.width === undefined && args.resizeOptions?.height === undefined
          ? this.default.width
          : undefined,
      // Background is separate because its a reference, whereas the rest are primitive types
      background: args.resizeOptions?.background ?? this.default.background,
    };

    this.encoding = args.encoding ?? this.default.encoding;
  }
}
