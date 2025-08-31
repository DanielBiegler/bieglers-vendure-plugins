/**
 * This file should export the public API of the plugin.
 * This typically includes the Plugin class itself, as well as:
 *
 * - entities
 * - services which might be used externally
 * - events
 * - custom strategies that can be configured by the user of the plugin
 */
export { UserNotificationsPlugin } from "./plugin";
export { UserNotificationsOptions } from "./types";

export { UserNotificationsService } from "./services/main.service";
