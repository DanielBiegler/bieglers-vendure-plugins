import { OnApplicationBootstrap } from "@nestjs/common";
import { I18nService, PluginCommonModule, VendurePlugin } from "@vendure/core";
import { adminSchema } from "./api/api-extensions";
import { TranslateEverythingAdminResolver } from "./api/translate-everything.resolver";
import { PermissionTranslateEverything, PermissionTranslateEverythingEntry, PLUGIN_INIT_OPTIONS } from "./constants";
import { TranslateEverythingEntryProduct } from "./translate-everything-entry.entity";
import { TranslateEverythingService } from "./translate-everything.service";
import { en } from "./translations/en";
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
  entities: [TranslateEverythingEntryProduct],
  configuration: (config) => {
    config.authOptions.customPermissions.push(PermissionTranslateEverything);
    config.authOptions.customPermissions.push(PermissionTranslateEverythingEntry);
    return config;
  },
  compatibility: ">=3.0.0",
})
export class TranslateEverythingPlugin implements OnApplicationBootstrap {
  /** @internal */
  static options: PluginTranslateEverythingOptions;

  constructor(private i18nService: I18nService) {}

  onApplicationBootstrap() {
    this.i18nService.addTranslation("en", en);
  }

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
