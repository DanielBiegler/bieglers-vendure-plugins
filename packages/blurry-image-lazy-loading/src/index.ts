/**
 * This file should export the public API of the plugin.
 * This typically includes the Plugin class itself, as well as:
 *
 * - entities
 * - services which might be used externally
 * - events
 * - custom strategies that can be configured by the user of the plugin
 */
export { PreviewImageHashPlugin } from "./preview-image-hash.plugin";
export { PluginPreviewImageHashOptions } from "./types";

export { PreviewImageHashService } from "./services/PreviewImageHashService";
export {
  PreviewImageHashBase,
  PreviewImageHashBaseArgs,
  PreviewImageHashStrategy,
} from "./config/PreviewImageHashStrategy";

export * as thumbhash from "./vendors/thumbhash";
export { ThumbHashStrategy } from "./config/ThumbHashStrategy";

export * as blurhash from "./vendors/blurhash";
export { BlurHashStrategy } from "./config/BlurHashStrategy";

export {
  MutationPluginPreviewImageHashCreateImageHashArgs,
  PluginPreviewImageHashCreateInput,
  PluginPreviewImageHashCreateResult,

  MutationPluginPreviewImageHashCreateImageHashesForProductArgs,
  PluginPreviewImageHashForProductInput,

  MutationPluginPreviewImageHashCreateImageHashesForCollectionArgs,
  PluginPreviewImageHashForCollectionInput,
  
  MutationPluginPreviewImageHashCreateImageHashesForAllAssetsArgs,
  PluginPreviewImageHashForAllAssetsInput,
  
  PluginPreviewImageHashResult,
  PluginPreviewImageHashResultCode
} from "./generated-admin-types";

