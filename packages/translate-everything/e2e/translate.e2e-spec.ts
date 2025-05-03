import { createTestEnvironment } from "@vendure/testing";
import path from "path";
import { afterAll, assert, beforeAll, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { TranslateEverythingPlugin } from "../src";
import { TestTranslationStrategy, testTranslator } from "./fixtures/strategy";
import { TRANSLATE_PRODUCT } from "./graphql/admin-e2e-definitions";
import {
  LanguageCode,
  TranslateProductMutation,
  TranslateProductMutationVariables,
} from "./types/generated-admin-types";

describe("Plugin Translate Everything", { concurrent: true }, async () => {
  const { server, adminClient } = createTestEnvironment({
    ...testConfig(8001),
    plugins: [
      TranslateEverythingPlugin.init({
        translationStrategy: new TestTranslationStrategy(),
      }),
    ],
  });

  beforeAll(async () => {
    await server.init({
      productsCsvPath: path.join(__dirname, "../../../utils/e2e/e2e-products-full.csv"),
      initialData: initialData,
      customerCount: 2,
    });
    await adminClient.asSuperAdmin();
  }, 60000);

  afterAll(async () => {
    await server.destroy();
  });

  test("Fail due to non-existing product", async ({ expect }) => {
    const productId = "1337"; // Doesnt exist
    const sourceLanguage = LanguageCode.en;
    const targetLanguage = LanguageCode.de;

    const res = adminClient.query<TranslateProductMutation, TranslateProductMutationVariables>(TRANSLATE_PRODUCT, {
      input: { productId, sourceLanguage, targetLanguage },
    });

    await expect(res).rejects.toThrow(`No Product with the id "${productId}" could be found`);
  });

  test("Fail due to missing source translation", async ({ expect }) => {
    const productId = "1";
    const sourceLanguage = LanguageCode.ru; // Doesnt exist
    const targetLanguage = LanguageCode.de;

    const res = adminClient.query<TranslateProductMutation, TranslateProductMutationVariables>(TRANSLATE_PRODUCT, {
      input: { productId, sourceLanguage, targetLanguage },
    });

    await expect(res).rejects.toThrow("pluginTranslateEverything.error.sourceLanguageNotFound");
  });

  test("Successfully translate product", async ({ expect }) => {
    const productId = "1";
    const sourceLanguage = LanguageCode.en;
    const targetLanguage = LanguageCode.de;

    const res = await adminClient.query<TranslateProductMutation, TranslateProductMutationVariables>(
      TRANSLATE_PRODUCT,
      { input: { productId, sourceLanguage, targetLanguage } },
    );

    expect(res.translateProduct.__typename).toStrictEqual("Product");

    // // // Source Translation

    const source = res.translateProduct.translations.find((t) => t.languageCode === sourceLanguage);
    assert(source, `Failed to find source translation: ${sourceLanguage}`);

    expect(source.name).toStrictEqual("Laptop");
    expect(source.description).toStrictEqual(
      "Now equipped with seventh-generation Intel Core processors, Laptop is snappier than ever. From daily tasks like launching apps and opening files to more advanced computing, you can power through your day thanks to faster SSDs and Turbo Boost processing up to 3.6GHz.",
    );
    expect(source.slug).toStrictEqual("laptop");

    // // // Target Translation

    const target = res.translateProduct.translations.find((t) => t.languageCode === targetLanguage);
    assert(target, `Failed to find target translation: ${targetLanguage}`);

    expect(target.name).toStrictEqual(testTranslator(source.name, sourceLanguage, targetLanguage));
    expect(target.description).toStrictEqual(testTranslator(source.description, sourceLanguage, targetLanguage));
    expect(target.slug).toStrictEqual(""); // TODO empty for now

    // // // Generated Entries

    // TODO
  });
});
