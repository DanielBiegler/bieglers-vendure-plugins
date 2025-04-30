import { TranslationStrategy } from "./config/translation-strategy";

/**
 * These are the configuration options for the plugin.
 *
 * @category Plugin
 */
export interface PluginTranslateEverythingOptions {
  /**
   * Determines how the input string will get translated
   *
   * // TODO example
   */
  translationStrategy: TranslationStrategy;
}
