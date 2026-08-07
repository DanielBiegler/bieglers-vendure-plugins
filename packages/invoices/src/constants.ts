import { CrudPermissionDefinition, PermissionDefinition } from "@vendure/core";
import type { DatabaseType } from "typeorm";

/** @internal */
export const loggerCtx = "PluginInvoices";
/** @internal */
export const PLUGIN_INIT_OPTIONS = Symbol("PLUGIN_INIT_OPTIONS");

export const INVOICE_QUEUE_NAME = "plugin-invoices";
export const DEFAULT_SEQUENCE_CODE = "__default";

/**
 * Type of the order history entry written whenever a document is issued.
 *
 * Values of the `HistoryEntryType` enum share one namespace across all plugins and a
 * duplicate breaks schema merging at bootstrap, hence the prefix.
 */
export const PLUGIN_INVOICE_CREATED = "PLUGIN_INVOICE_CREATED";

/**
 * Base path of the endpoint that streams invoice files, i.e. `/invoices/:id/download`.
 *
 * Not configurable, because Nest reads controller paths at decoration time, which
 * happens before `InvoicesPlugin.init()` ever runs.
 */
export const INVOICE_DOWNLOAD_ROUTE = "invoices";
export const DEFAULT_DOWNLOAD_EXPIRES_IN = 300;

/**
 * Stands in for the expiry timestamp of URLs that never expire.
 *
 * Signed alongside the invoice ID, so swapping a finite timestamp for this sentinel
 * invalidates the signature instead of granting an eternal URL.
 */
export const DOWNLOAD_NEVER_EXPIRES = "never";

export const InvoicePermissions = new CrudPermissionDefinition("Invoice")
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
