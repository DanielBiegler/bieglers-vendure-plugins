import { LanguageCode, PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AdminResolver, PluginPreviewImageHashCreateResultResolver } from "./api/admin.resolver";
import { adminApiExtensions } from "./api/api-extensions";
import { CUSTOMFIELD_NAME, PLUGIN_INIT_OPTIONS } from "./constants";
import { PreviewImageHashService } from "./services/PreviewImageHashService";
import { PluginPreviewImageHashOptions } from "./types";

/**
 * The PreviewImageHashPlugin generates image hashes for displaying blurry previews when loading images on the frontend.
 *
 * Adding this plugin requires a migration because it introduces a custom field `previewImageHash` on the Asset entity.
 *
 * ### 1. Add the plugin to your Vendure Config
 *
 * The simplest way is relying on the defaults and just adding the plugin with a hashing strategy.
 *
 * ```ts
 * export const config: VendureConfig = {
 *   // ...
 *   plugins: [
 *     PreviewImageHashPlugin.init({
 *       hashingStrategy: new ThumbHashStrategy(), // Recommended
 *     }),
 *   ],
 * }
 * ```
 *
 * It's possible to pass in further configurations into both the plugin and the strategies, for example:
 *
 * ```ts
 * PreviewImageHashPlugin.init({
 *   enqueueHashingAfterAssetCreation: false,
 *   hashingStrategy: new ThumbHashStrategy({
 *     encoding: "hex",
 *     resizeOptions: {
 *       width: 32,
 *       fit: "contain"
 *     }
 *   }),
 * })
 * ```
 *
 * Please refer to the specific docs for how and what you can customize.
 *
 * ### 2. Generate hashes
 *
 * By default the option `enqueueHashingAfterAssetCreation` automatically adds hashing tasks to the dedicated job queue for newly added assets.
 *
 * For existing assets you can produce hashes either synchronously or via the job queue, of which the latter is recommended for production environments, via the admin API:
 *
 * ```graphql
 * mutation {
 *   pluginPreviewImageHashCreateImageHash(
 *     input: {
 *       idAsset: "example123",
 *       runSynchronously: true,  # False by default
 *     }
 *   ) {
 *     # When running asynchronously you get a short status response.
 *     ... on PluginPreviewImageHashResult {
 *       code
 *       jobsAddedToQueue
 *       message
 *     }
 *
 *     # When running synchronously, you get the Asset directly.
 *     # This is useful for scripts.
 *     ... on Asset {
 *       id
 *       name
 *       customFields {
 *         previewImageHash
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * ### 3. Consume the hashes in your frontend
 *
 * Now that your assets have hashes you may consume them on your frontend. How and where you consume them exactly is dependent on your setup, but in general it involves the following steps.
 *
 * 1. Retrieve assets, for example:
 *
 * ```graphql
 * query {
 *   collection(slug: "example") {
 *     productVariants(options: { take: 10 }) {
 *       items {
 *         name
 *         featuredAsset {
 *           preview
 *           width
 *           height
 *           customFields {
 *             previewImageHash
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * 2. For example with the `ThumbHashStrategy` and its `BufferEncoding` set to the default `"base64"` you can now decode the hashes with the provided helper like so:
 *
 * ```ts
 * const buffer = Buffer.from(previewImagehash, "base64");
 * const dataUrl = thumbHashToDataURL(buffer);
 * ```
 *
 * 3. Use the result in your frontend, for example in an imaginary react component.
 *
 * ```jsx
 * <MyCustomImgComponent
 *   previewSrc={dataUrl}
 *   src={asset.preview}
 *   width={asset.width}
 *   height={asset.height}
 * />
 * ```
 *
 * @category Plugin
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    {
      provide: PLUGIN_INIT_OPTIONS,
      useFactory: () => PreviewImageHashPlugin.options,
    },
    PreviewImageHashService,
  ],
  adminApiExtensions: {
    resolvers: [AdminResolver, PluginPreviewImageHashCreateResultResolver],
    schema: adminApiExtensions,
  },
  configuration: (config) => {
    config.customFields.Asset.push({
      name: CUSTOMFIELD_NAME,
      type: "string",
      nullable: true,
      public: true,
      unique: false,
      readonly: true,
      label: [
        { languageCode: LanguageCode.en, value: "Preview Image Hash" },
        { languageCode: LanguageCode.de, value: "Vorschaubild Hash" },
      ],
      description: [
        {
          languageCode: LanguageCode.en,
          value: "Image hash for displaying blurry previews when loading images on the frontend.",
        },
        {
          languageCode: LanguageCode.de,
          value: "Bild-Hash um verschwommene Vorschaubilder für ladende Bilder anzeigen zu können.",
        },
      ],
    });
    return config;
  },
  compatibility: ">=3.0.0",
})
export class PreviewImageHashPlugin {
  /** @internal */
  static options: PluginPreviewImageHashOptions;

  /**
   * The static `init()` method is called with the options to configure the plugin.
   *
   * @example
   * ```ts
   * PreviewImageHashPlugin.init({
   *   hashingStrategy: new ThumbHashStrategy(),
   * }),
   * ```
   */
  static init(options: PluginPreviewImageHashOptions) {
    this.options = options;
    return PreviewImageHashPlugin;
  }
}
