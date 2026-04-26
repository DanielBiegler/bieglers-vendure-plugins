/**
 * This file should export the public API of the plugin.
 * This typically includes the Plugin class itself, as well as:
 *
 * - entities
 * - services which might be used externally
 * - events
 * - custom strategies that can be configured by the user of the plugin
 */
export { InvoicesPlugin } from "./plugin";

export * from "./entities/CreditNote.entity";
export * from "./entities/Invoice.entity";
export * from "./entities/InvoiceConfig.entity";

export * from "./services/Invoice.service";

export * from "./events";

export * from "./types";

export * from "./config/DebugFileGenerationStrategy";
export * from "./config/InvoiceFileGenerationStrategy";
export * from "./config/SequentialIdPrefixGenerationStrategy";
export * from "./config/StaticSequentialIdPrefixGenerationStrategy";

