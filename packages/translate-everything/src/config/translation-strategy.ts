import { LanguageCode } from "@vendure/core";

/**
 * Determines how strings get translated.
 *
 * // TODO think about if we can translate custom entities too?!
 *
 * @category Strategy
 */
export interface TranslationStrategy {
  translateString(input: string, sourceLanguage: LanguageCode, targetLanguage: LanguageCode): Promise<string>;
}

/**
 * Internal strategy for server bootstrap without needing a real strategy.
 * Needed for generating types for example.
 *
 * @throws Error Method not implemented.
 * @internal
 */
export class NoopTranslationStrategy implements TranslationStrategy {
  translateString(input: string, sourceLanguage: LanguageCode, targetLanguage: LanguageCode): Promise<string> {
    throw new Error("Method not implemented.");
  }
}

// TODO examples:
//
// export class GoogleTranslatorTranslationStrategy implements TranslationStrategy
// export class LibreTranslateTranslationStrategy implements TranslationStrategy
// export class DeeplTranslationStrategy implements TranslationStrategy {
// ... ?
