import { LanguageCode } from "@vendure/core";
import { TranslationStrategy } from "../../src";

/**
 * Just for testing purposes
 *
 * @internal
 */
export const testTranslator = (input: string, sourceLanguage: LanguageCode, targetLanguage: LanguageCode) =>
  `Translated<from=${sourceLanguage} to=${targetLanguage} input=${input}>`;

/**
 * Just for testing purposes, uses {@link testTranslator}
 *
 * @internal
 */
export class TestTranslationStrategy implements TranslationStrategy {
  async translateString(input: string, sourceLanguage: LanguageCode, targetLanguage: LanguageCode): Promise<string> {
    return testTranslator(input, sourceLanguage, targetLanguage);
  }
}

/**
 * Just for testing purposes
 *
 * @internal
 */
export class RejectTranslationStrategy implements TranslationStrategy {
  translateString(input: string, sourceLanguage: LanguageCode, targetLanguage: LanguageCode): Promise<string> {
    throw new Error("Handle this");
  }
}
