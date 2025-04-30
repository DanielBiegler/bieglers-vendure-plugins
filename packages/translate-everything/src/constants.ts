import { CrudPermissionDefinition, PermissionDefinition } from "@vendure/core";

/** @internal */
export const loggerCtx = "PluginTranslateEverything";
/** @internal */
export const PLUGIN_INIT_OPTIONS = Symbol("PLUGIN_INIT_OPTIONS");

/**
 * Allows Users to generate translations of Products, Facets, etc. via the "Translate Everything"-Plugin.
 * Be aware that this may incur costs, for example by a third party API, depending on the configured strategy.
 */
export const PermissionTranslateEverything = new PermissionDefinition({
  name: "PluginTranslateEverything",
  description:
    'Allows Users to generate translations of Products, Facets, etc. via the "Translate Everything"-Plugin. Be aware that this may incur costs, for example by a third party API, depending on the configured strategy.',
});

/**
 * CRUD for {@link TranslateEverythingEntry}
 */
export const PermissionTranslateEverythingEntry = new CrudPermissionDefinition("PluginTranslateEverythingEvent");
