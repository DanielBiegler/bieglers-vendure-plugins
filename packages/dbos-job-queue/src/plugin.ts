import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AdminResolver } from "./api/admin.resolver";
import { adminApiExtensions } from "./api/api-extensions";
import { PLUGIN_INIT_OPTIONS } from "./constants";
import { DBOSJobQueueService } from "./services/main.service";
import { DBOSJobQueueOptions } from "./types";

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
      useFactory: () => DBOSJobQueuePlugin.options,
    },
    DBOSJobQueueService,
  ],
  adminApiExtensions: {
    resolvers: [AdminResolver],
    schema: adminApiExtensions,
  },
  compatibility: ">=3.0.0",
})
export class DBOSJobQueuePlugin {
  /** @internal */
  static options: DBOSJobQueueOptions;

  /**
   * The static `init()` method is called with the options to configure the plugin.
   *
   * @example
   * ```ts
   * DBOSJobQueuePlugin.init({}),
   * ```
   */
  static init(options: DBOSJobQueueOptions) {
    this.options = options;
    return DBOSJobQueuePlugin;
  }
}
