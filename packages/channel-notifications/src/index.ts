/**
 * This file should export the public API of the plugin.
 * This typically includes the Plugin class itself, as well as:
 *
 * - entities
 * - services which might be used externally
 * - events
 * - custom strategies that can be configured by the user of the plugin
 */

export { ChannelNotificationsPlugin } from "./plugin";
export { ChannelNotificationsOptions } from "./types";

export {
  // Currently not sure if these should be exported. Let's leave em blank for now.
  // CustomChannelNotificationFields,
  // CustomChannelNotificationFieldsTranslation,
  // CustomChannelNotificationReadReceiptFields,
  ChannelNotification,
  ChannelNotificationReadReceipt,
  ChannelNotificationTranslation
} from "./entities/channel-notification.entity";

export { ChannelNotificationsService } from "./services/main.service";

export {
  ChannelNotificationEvent,
  ChannelNotificationEventInput,
  ChannelNotificationEventMarkedAsRead
} from "./events";
