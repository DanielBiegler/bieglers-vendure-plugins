import { CrudPermissionDefinition, PermissionDefinition } from "@vendure/core";
import type { DatabaseType } from "typeorm";

/** @internal */
export const loggerCtx = "PluginInvoices";
/** @internal */
export const PLUGIN_INIT_OPTIONS = Symbol("PLUGIN_INIT_OPTIONS");

export const permissionsCrud = new CrudPermissionDefinition("invoice")
export const permissionsConfig = new PermissionDefinition({ name: "invoice-config" }) // TODO description?

/**
 * # TODO this should be thoroughly documented and mentioned in README!
 */
export const ROW_LOCK_COMPATIBLE_DATABASES: DatabaseType[] = [
  "postgres",
  "aurora-postgres",
  "cockroachdb",
  "mysql",
  "mariadb",
  "aurora-mysql",
  "oracle",
];
