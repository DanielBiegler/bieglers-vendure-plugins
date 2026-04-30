import { CrudPermissionDefinition, PermissionDefinition } from "@vendure/core";
import type { DatabaseType } from "typeorm";

/** @internal */
export const loggerCtx = "PluginInvoices";
/** @internal */
export const PLUGIN_INIT_OPTIONS = Symbol("PLUGIN_INIT_OPTIONS");

export const INVOICE_QUEUE_NAME = "plugin-invoices";
export const DEFAULT_SEQUENCE_CODE_INVOICE = "__default_invoice";
export const DEFAULT_SEQUENCE_CODE_CREDIT = "__default_credit";

export const InvoicePermissions = new CrudPermissionDefinition("invoice")
export const InvoiceConfigPermissions = new PermissionDefinition({ name: "invoice-config" }) // TODO description?

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
