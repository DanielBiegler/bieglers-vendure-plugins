import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { adminSchema } from "./api/api-extensions";
import { TranslateEverythingAdminResolver } from "./api/translate-everything.resolver";
import { PermissionTranslateEverything, PermissionTranslateEverythingEntry, PLUGIN_INIT_OPTIONS } from "./constants";
import { TranslateEverythingEntry } from "./translate-everything-entry.entity";
import { TranslateEverythingService } from "./translate-everything.service";
import { PluginTranslateEverythingOptions } from "./types";

/**
 * // TODO
 *
 * @category Plugin
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    {
      provide: PLUGIN_INIT_OPTIONS,
      useFactory: () => TranslateEverythingPlugin.options,
    },
    TranslateEverythingService,
  ],
  adminApiExtensions: {
    schema: adminSchema,
    resolvers: [TranslateEverythingAdminResolver],
  },
  entities: [TranslateEverythingEntry],
  configuration: (config) => {
    config.authOptions.customPermissions.push(PermissionTranslateEverything);
    config.authOptions.customPermissions.push(PermissionTranslateEverythingEntry);
    return config;
  },
  compatibility: ">=3.0.0",
})
export class TranslateEverythingPlugin {
  /** @internal */
  static options: PluginTranslateEverythingOptions;

  /**
   * The static `init()` method is called with the options to configure the plugin.
   *
   * @example
   * ```ts
   * // TODO
   * ```
   */
  static init(options: PluginTranslateEverythingOptions) {
    this.options = options;
    return TranslateEverythingPlugin;
  }
}
