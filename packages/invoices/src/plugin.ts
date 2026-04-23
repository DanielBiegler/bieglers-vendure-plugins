import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AdminResolver } from "./api/admin.resolver";
import { adminApiExtensions } from "./api/api-extensions";
import { PLUGIN_INIT_OPTIONS } from "./constants";
import { InvoicesService } from "./services/main.service";
import { InvoicesOptions } from "./types";

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
      useFactory: () => InvoicesPlugin.options,
    },
    InvoicesService,
  ],
  adminApiExtensions: {
    resolvers: [AdminResolver],
    schema: adminApiExtensions,
  },
  compatibility: ">=3.0.0",
})
export class InvoicesPlugin {
  /** @internal */
  static options: InvoicesOptions;

  /**
   * The static `init()` method is called with the options to configure the plugin.
   *
   * @example
   * ```ts
   * InvoicesPlugin.init({}),
   * ```
   */
  static init(options: InvoicesOptions) {
    this.options = options;
    return InvoicesPlugin;
  }
}
