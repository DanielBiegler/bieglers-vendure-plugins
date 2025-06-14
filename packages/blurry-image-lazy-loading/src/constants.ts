/** @internal */
export const loggerCtx = "PluginPreviewImageHash";
/** @internal */
export const PLUGIN_INIT_OPTIONS = Symbol("PLUGIN_INIT_OPTIONS");

/** Officially supported Vendure AssetServerPlugin formats */
export const SUPPORTED_IMG_TYPES = ["png", "jpg", "jpeg", "webp", "avif"];
export const SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
];

export const CUSTOMFIELD_NAME = "previewImageHash";

export const DEFAULT_ENQUEUE_HASHING_AFTER_ASSET_CREATION = true;
export const DEFAULT_COLLECTION_PAGINATION = 50;
export const DEFAULT_DEDUPLICATE_ASSET_IDS = true;
export const DEFAULT_REGENERATE_HASHES = false;
