import { CrudPermissionDefinition, PermissionDefinition } from "@vendure/core";

/** @internal */
export const loggerCtx = "PluginInvoices";
/** @internal */
export const PLUGIN_INIT_OPTIONS = Symbol("PLUGIN_INIT_OPTIONS");

export const permissionsCrud = new CrudPermissionDefinition("invoice")
export const permissionsConfig = new PermissionDefinition({ name: "invoice-config" }) // TODO description?
