import { BlurHashStrategy } from "./config/BlurHashStrategy";
import {
  PreviewImageHashBase,
  PreviewImageHashBaseArgs,
  PreviewImageHashStrategy,
} from "./config/PreviewImageHashStrategy";
import { ThumbHashStrategy } from "./config/ThumbHashStrategy";
import {
  MutationPluginPreviewImageHashCreateImageHashArgs,
  MutationPluginPreviewImageHashCreateImageHashesForCollectionArgs,
  MutationPluginPreviewImageHashCreateImageHashesForProductArgs,
  PluginPreviewImageHashCreateInput,
  PluginPreviewImageHashCreateResult,
  PluginPreviewImageHashForCollectionInput,
  PluginPreviewImageHashForProductInput,
  PluginPreviewImageHashResult,
  PluginPreviewImageHashResultCode,
} from "./generated-admin-types";
import { PreviewImageHashService } from "./services/PreviewImageHashService";
import * as blurhash from "./vendors/blurhash";
import * as thumbhash from "./vendors/thumbhash";

/**
 * This file should export the public API of the plugin.
 * This typically includes the Plugin class itself, as well as:
 *
 * - entities
 * - services which might be used externally
 * - events
 * - custom strategies that can be configured by the user of the plugin
 */
export * from "./preview-image-hash.plugin";
export { PluginPreviewImageHashOptions } from "./types";
export {
  blurhash,
  BlurHashStrategy,
  MutationPluginPreviewImageHashCreateImageHashArgs,
  MutationPluginPreviewImageHashCreateImageHashesForCollectionArgs,
  MutationPluginPreviewImageHashCreateImageHashesForProductArgs,
  PluginPreviewImageHashCreateInput,
  PluginPreviewImageHashCreateResult,
  PluginPreviewImageHashForCollectionInput,
  PluginPreviewImageHashForProductInput,
  PluginPreviewImageHashResult,
  PluginPreviewImageHashResultCode,
  PreviewImageHashBase,
  PreviewImageHashBaseArgs,
  PreviewImageHashService,
  PreviewImageHashStrategy,
  thumbhash,
  ThumbHashStrategy,
};
