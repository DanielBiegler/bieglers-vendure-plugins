import { ID } from "@vendure/core";
import { createTestEnvironment } from "@vendure/testing";
import path from "path";
import { afterAll, assert, beforeAll, describe, ExpectStatic, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { TranslateEverythingPlugin } from "../src";
import { TestTranslationStrategy, testTranslator } from "./fixtures/strategy";
import { GET_CURRENT_ADMIN, TRANSLATE_PRODUCT } from "./graphql/admin-e2e-definitions";
import {
  GetActiveAdminIdQuery,
  GetActiveAdminIdQueryVariables,
  LanguageCode,
  TranslateEverythingEntryKindProduct as TKindProduct,
  TranslateEverythingEntryProduct,
  TranslateProductMutation,
  TranslateProductMutationVariables,
} from "./types/generated-admin-types";

/**
 * Generic helper to keep testing of translation entries DRY
 * // TODO this whole thing seems to complicated, lets dumb it down
 */
async function testTranslation(
  expect: ExpectStatic,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  adminId: ID,
  productId: ID,
  entry: TranslateEverythingEntryProduct,
  kind: TKindProduct,
) {
  assert(entry.__typename === "TranslateEverythingEntryProduct");
  assert(entry.product.translations.length === 2); // 1. default, 2. translated

  const translationSource = entry.product.translations.find((t) => t.languageCode === sourceLanguage);
  assert(translationSource);
  const translationTarget = entry.product.translations.find((t) => t.languageCode === targetLanguage);
  assert(translationTarget);

  let field: keyof typeof translationSource;
  if (kind === TKindProduct.NAME) field = "name";
  else if (kind === TKindProduct.DESCRIPTION) field = "description";
  else if (kind === TKindProduct.SLUG) field = "slug";
  else throw new Error(`Unknown TranslateEverythingEntryKindProduct: ${kind}`); // TODO custom fields?

  expect(entry.sourceLanguage).toStrictEqual(sourceLanguage);
  expect(entry.targetLanguage).toStrictEqual(targetLanguage);
  expect(entry.translationKind).toStrictEqual(kind);

  expect(entry.sourceText).toStrictEqual(translationSource[field]);
  expect(entry.targetText).toStrictEqual(translationTarget[field]);
  expect(entry.targetText).toStrictEqual(testTranslator(translationSource[field], sourceLanguage, targetLanguage));

  expect(entry.adminId).toStrictEqual(adminId);
  expect(entry.admin.id).toStrictEqual(adminId);

  expect(entry.productId).toStrictEqual(productId);
  expect(entry.product.id).toStrictEqual(productId);
}

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

    // TODO see https://docs.vendure.io/guides/developer-guide/translations/#server-message-translations
    await expect(res).rejects.toThrow("pluginTranslateEverything.error.sourceLanguageNotFound");
  });

  test("Successfully translate product", async ({ expect }) => {
    const productId = "T_1";
    const sourceLanguage = LanguageCode.en;
    const targetLanguage = LanguageCode.de;

    const res = await adminClient.query<TranslateProductMutation, TranslateProductMutationVariables>(
      TRANSLATE_PRODUCT,
      { input: { productId, sourceLanguage, targetLanguage } },
    );

    const resAdmin = await adminClient.query<GetActiveAdminIdQuery, GetActiveAdminIdQueryVariables>(GET_CURRENT_ADMIN);
    assert(resAdmin.activeAdministrator);

    const translationName = res.pluginTranslateProduct.find((tp) => tp.translationKind === TKindProduct.NAME);
    assert(translationName, `Failed to find translation entry with kind: ${TKindProduct.NAME}`);

    const translationDesc = res.pluginTranslateProduct.find((tp) => tp.translationKind === TKindProduct.DESCRIPTION);
    assert(translationDesc, `Failed to find translation entry with kind: ${TKindProduct.DESCRIPTION}`);

    // Translated Name

    await testTranslation(
      expect,
      sourceLanguage,
      targetLanguage,
      resAdmin.activeAdministrator.id,
      productId,
      // TODO typescript error
      translationName,
      TKindProduct.NAME,
    );

    // Translated Description

    await testTranslation(
      expect,
      sourceLanguage,
      targetLanguage,
      resAdmin.activeAdministrator.id,
      productId,
      // TODO typescript error
      translationDesc,
      TKindProduct.DESCRIPTION,
    );

    // TODO slug?
  });
});
