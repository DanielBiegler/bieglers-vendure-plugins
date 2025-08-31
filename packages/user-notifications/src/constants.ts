import { CrudPermissionDefinition } from "@vendure/core";

/** @internal */
export const loggerCtx = "PluginUserNotifications";
/** @internal */
export const PLUGIN_INIT_OPTIONS = Symbol("PLUGIN_INIT_OPTIONS");

export const permission = new CrudPermissionDefinition("UserNotification");
