import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AdminResolver } from "./api/admin.resolver";
import { adminApiExtensions } from "./api/api-extensions";
import { PLUGIN_INIT_OPTIONS } from "./constants";
import { UserNotificationsService } from "./services/main.service";
import { UserNotificationsOptions } from "./types";

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
      useFactory: () => UserNotificationsPlugin.options,
    },
    UserNotificationsService,
  ],
  adminApiExtensions: {
    resolvers: [AdminResolver],
    schema: adminApiExtensions,
  },
  compatibility: ">=3.0.0",
})
export class UserNotificationsPlugin {
  /** @internal */
  static options: UserNotificationsOptions;

  /**
   * The static `init()` method is called with the options to configure the plugin.
   *
   * @example
   * ```ts
   * UserNotificationsPlugin.init({}),
   * ```
   */
  static init(options: UserNotificationsOptions) {
    this.options = options;
    return UserNotificationsPlugin;
  }
}
