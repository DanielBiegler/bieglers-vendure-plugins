import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { AdminResolver, FieldResolver } from "./api/admin.resolver";
import { adminApiExtensions } from "./api/api-extensions";
import { permission, PLUGIN_INIT_OPTIONS } from "./constants";
import { ChannelNotification, ChannelNotificationReadReceipt, ChannelNotificationTranslation } from "./entities/channel-notification.entity";
import { ChannelNotificationsService } from "./services/main.service";
import { ChannelNotificationsOptions } from "./types";

/**
 * The **ChannelNotificationsPlugin** provides a foundation for building notification inboxes and or changelogs for your users.
 * Features channel aware, translatable and customizable notifications with read-receipts per user.
 * 
 * Add it to your Vendure Config:
 * 
 * ```ts
 * import { ChannelNotificationsPlugin } from "@danielbiegler/vendure-plugin-channel-notifications";
 * export const config: VendureConfig = {
 *   // ...
 *   plugins: [
 *     ChannelNotificationsPlugin.init({}),
 *   ],
 * }
 * ```
 * 
 * Please refer to the specific [docs](https://github.com/DanielBiegler/bieglers-vendure-plugins/blob/master/packages/channel-notifications/src/types.ts) for how and what you can customize.
 * 
 * ---
 * 
 * This plugin adds new entities, namely:
 * 
 * - `ChannelNotification`
 * - `ChannelNotificationTranslation`
 * - `ChannelNotificationReadReceipt`
 * 
 * And a service called: `ChannelNotificationsService` for comfortably working with them server side.
 * The API too gets extended with the following queries:
 * 
 * ```graphql
 * extend type Query {
 *   "Get a single notification"
 *   channelNotification(id: ID!): ChannelNotification
 *   "List all notifications for the active user, by default orders by dateTime descending"
 *   channelNotificationList(options: ChannelNotificationListOptions): ChannelNotificationList!
 * }
 * 
 * extend type Mutation {
 *   CreateChannelNotification(input: CreateChannelNotificationInput!): ChannelNotification!
 *   UpdateChannelNotification(input: UpdateChannelNotificationInput!): ChannelNotification!
 *   DeleteChannelNotification(input: DeleteChannelNotificationInput!): DeletionResponse!
 *   MarkChannelNotificationAsRead(input: MarkChannelNotificationAsReadInput!): Success!
 * }
 * ```
 * 
 * And a custom permission so you can granularly define who can create and read notifications.
 * 
 * ---
 * 
 * It's important to note that this plugin aims to be **a foundation** for you to build upon.
 * The default notification entity only holds the bare minimum of information and you are supposed to extend it
 * via custom fields to fit your specific business need.
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
  entities: [ChannelNotification, ChannelNotificationTranslation, ChannelNotificationReadReceipt],
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
