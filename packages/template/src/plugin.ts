import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AdminResolver } from "./api/admin.resolver";
import { adminApiExtensions } from "./api/api-extensions";
import { PLUGIN_INIT_OPTIONS } from "./constants";
import { __SCAFFOLD_TITLE_NO_SPACE__Service } from "./services/main.service";
import { __SCAFFOLD_TITLE_NO_SPACE__Options } from "./types";

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
      useFactory: () => __SCAFFOLD_TITLE_NO_SPACE__Plugin.options,
    },
    __SCAFFOLD_TITLE_NO_SPACE__Service,
  ],
  adminApiExtensions: {
    resolvers: [AdminResolver],
    schema: adminApiExtensions,
  },
  compatibility: ">=3.0.0",
})
export class __SCAFFOLD_TITLE_NO_SPACE__Plugin {
  /** @internal */
  static options: __SCAFFOLD_TITLE_NO_SPACE__Options;

  /**
   * The static `init()` method is called with the options to configure the plugin.
   *
   * @example
   * ```ts
   * __SCAFFOLD_TITLE_NO_SPACE__Plugin.init({}),
   * ```
   */
  static init(options: __SCAFFOLD_TITLE_NO_SPACE__Options) {
    this.options = options;
    return __SCAFFOLD_TITLE_NO_SPACE__Plugin;
  }
}
