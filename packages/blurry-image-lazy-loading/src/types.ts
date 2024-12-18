import { PreviewImageHashStrategy } from "./config/PreviewImageHashStrategy";

/**
 * These are the configuration options for the plugin.
 *
 * @category Plugin
 */
export interface PluginPreviewImageHashOptions {
  /**
   * Makes the plugin subscribe to the `AssetEvent` of type `"created"` and adds the hashing to the dedicated job queue.
   * This ensures every new asset gets automatically hashed after being uploaded to your Vendure instance.
   *
   * @default true
   */
  enqueueHashingAfterAssetCreation?: boolean;

  /**
   * Determines the way assets will be hashed
   *
   * 1. ThumbHashStrategy supports transparency and approximate aspect ratios
   * 2. BlurHash is older and more widely used, but does not support transparency nor encoding aspect ratio
   *
   * @see ThumbHash https://github.com/evanw/thumbhash
   * @see BlurHash https://github.com/woltapp/blurhash
   */
  hashingStrategy: PreviewImageHashStrategy;
}
