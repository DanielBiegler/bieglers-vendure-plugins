import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AdminResolver, FieldResolver } from "./api/admin.resolver";
import { adminApiExtensions } from "./api/api-extensions";
import { permission, PLUGIN_INIT_OPTIONS } from "./constants";
import { ChannelNotification, ChannelNotificationReadEntry, ChannelNotificationTranslation } from "./entities/channel-notification.entity";
import { ChannelNotificationsService } from "./services/main.service";
import { ChannelNotificationsOptions } from "./types";

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
      useFactory: () => ChannelNotificationsPlugin.options,
    },
    ChannelNotificationsService,
  ],
  adminApiExtensions: {
    resolvers: [FieldResolver, AdminResolver],
    schema: adminApiExtensions,
  },
  entities: [ChannelNotification, ChannelNotificationTranslation, ChannelNotificationReadEntry],
  configuration(config) {
    config.authOptions.customPermissions.push(permission);
    return config;
  },
  compatibility: ">=3.0.0",
})
export class ChannelNotificationsPlugin {
  /** @internal */
  static options: ChannelNotificationsOptions;

  /**
   * The static `init()` method is called with the options to configure the plugin.
   *
   * @example
   * ```ts
   * ChannelNotificationsPlugin.init({}),
   * ```
   */
  static init(options: ChannelNotificationsOptions) {
    this.options = options;
    return ChannelNotificationsPlugin;
  }
}
