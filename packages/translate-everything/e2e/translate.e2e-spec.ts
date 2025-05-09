import { createTestEnvironment } from "@vendure/testing";
import path from "path";
import { afterAll, assert, beforeAll, describe, test } from "vitest";
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

    await expect(res).rejects.toThrow("Product(id=1) has no source ProductTranslation with LanguageCode.ru");
  });

  test("Successfully translate product", async ({ expect }) => {
    const productId = "T_1";
    const sourceLanguage = LanguageCode.en;
    const targetLanguage = LanguageCode.de;

    const res = await adminClient.query<TranslateProductMutation, TranslateProductMutationVariables>(
      TRANSLATE_PRODUCT,
      { input: { productId, sourceLanguage, targetLanguage } },
    );

    expect(res.pluginTranslateProduct.length).toStrictEqual(2); // Name, Description

    const resAdmin = await adminClient.query<GetActiveAdminIdQuery, GetActiveAdminIdQueryVariables>(GET_CURRENT_ADMIN);
    assert(resAdmin.activeAdministrator);

    const translationName = res.pluginTranslateProduct.find((tp) => tp.translationKind === TKindProduct.NAME);
    assert(translationName, `Failed to find translation entry with kind: ${TKindProduct.NAME}`);

    const translationDesc = res.pluginTranslateProduct.find((tp) => tp.translationKind === TKindProduct.DESCRIPTION);
    assert(translationDesc, `Failed to find translation entry with kind: ${TKindProduct.DESCRIPTION}`);

    // Translated Name

    assert(translationName.__typename === "TranslateEverythingEntryProduct");
    assert(translationName.product.translations.length === 2); // 1. default, 2. translated

    const translationSourceName = translationName.product.translations.find((t) => t.languageCode === sourceLanguage);
    assert(translationSourceName);
    const translationTargetName = translationName.product.translations.find((t) => t.languageCode === targetLanguage);
    assert(translationTargetName);

    expect(translationName.sourceLanguage).toStrictEqual(sourceLanguage);
    expect(translationName.targetLanguage).toStrictEqual(targetLanguage);
    expect(translationName.translationKind).toStrictEqual(TKindProduct.NAME);

    expect(translationName.sourceText).toStrictEqual(translationSourceName.name);
    expect(translationName.targetText).toStrictEqual(translationTargetName.name);
    expect(translationName.targetText).toStrictEqual(
      testTranslator(translationSourceName.name, sourceLanguage, targetLanguage),
    );

    expect(translationName.adminId).toStrictEqual(resAdmin.activeAdministrator.id);
    expect(translationName.admin.id).toStrictEqual(resAdmin.activeAdministrator.id);

    expect(translationName.productId).toStrictEqual(productId);
    expect(translationName.product.id).toStrictEqual(productId);

    // Translated Description

    assert(translationDesc.__typename === "TranslateEverythingEntryProduct");
    assert(translationDesc.product.translations.length === 2); // 1. default, 2. translated

    const translationSourceDesc = translationDesc.product.translations.find((t) => t.languageCode === sourceLanguage);
    assert(translationSourceDesc);
    const translationTargetDesc = translationDesc.product.translations.find((t) => t.languageCode === targetLanguage);
    assert(translationTargetDesc);

    expect(translationDesc.sourceLanguage).toStrictEqual(sourceLanguage);
    expect(translationDesc.targetLanguage).toStrictEqual(targetLanguage);
    expect(translationDesc.translationKind).toStrictEqual(TKindProduct.DESCRIPTION);

    expect(translationDesc.sourceText).toStrictEqual(translationSourceDesc.description);
    expect(translationDesc.targetText).toStrictEqual(translationTargetDesc.description);
    expect(translationDesc.targetText).toStrictEqual(
      testTranslator(translationSourceDesc.description, sourceLanguage, targetLanguage),
    );

    expect(translationDesc.adminId).toStrictEqual(resAdmin.activeAdministrator.id);
    expect(translationDesc.admin.id).toStrictEqual(resAdmin.activeAdministrator.id);

    expect(translationDesc.productId).toStrictEqual(productId);
    expect(translationDesc.product.id).toStrictEqual(productId);

    // TODO slug?
  });

  test("Successfully stop translations for already translated product fields", async ({ expect }) => {
    const productId = "T_2";
    const sourceLanguage = LanguageCode.en;
    const targetLanguage = LanguageCode.de;

    const res01 = await adminClient.query<TranslateProductMutation, TranslateProductMutationVariables>(
      TRANSLATE_PRODUCT,
      { input: { productId, sourceLanguage, targetLanguage } },
    );

    expect(res01.pluginTranslateProduct.length).toStrictEqual(2); // Name, Description

    const translationName = res01.pluginTranslateProduct.find((tp) => tp.translationKind === TKindProduct.NAME);
    assert(translationName, `Failed to find translation entry with kind: ${TKindProduct.NAME}`);

    const translationDesc = res01.pluginTranslateProduct.find((tp) => tp.translationKind === TKindProduct.DESCRIPTION);
    assert(translationDesc, `Failed to find translation entry with kind: ${TKindProduct.DESCRIPTION}`);

    const res02 = await adminClient.query<TranslateProductMutation, TranslateProductMutationVariables>(
      TRANSLATE_PRODUCT,
      { input: { productId, sourceLanguage, targetLanguage } },
    );

    // We already translated this product and have no overwrite-input
    expect(res02.pluginTranslateProduct.length).toStrictEqual(0);
  });

  test("Successfully overwrite translations for already translated product fields", async ({ expect }) => {
    const productId = "T_3";
    const sourceLanguage = LanguageCode.en;
    const targetLanguage = LanguageCode.de;

    const res01 = await adminClient.query<TranslateProductMutation, TranslateProductMutationVariables>(
      TRANSLATE_PRODUCT,
      { input: { productId, sourceLanguage, targetLanguage } },
    );

    expect(res01.pluginTranslateProduct.length).toStrictEqual(2); // Name, Description

    const translationName = res01.pluginTranslateProduct.find((tp) => tp.translationKind === TKindProduct.NAME);
    assert(translationName, `Failed to find translation entry with kind: ${TKindProduct.NAME}`);

    const translationDesc = res01.pluginTranslateProduct.find((tp) => tp.translationKind === TKindProduct.DESCRIPTION);
    assert(translationDesc, `Failed to find translation entry with kind: ${TKindProduct.DESCRIPTION}`);

    const res02 = await adminClient.query<TranslateProductMutation, TranslateProductMutationVariables>(
      TRANSLATE_PRODUCT,
      { input: { productId, sourceLanguage, targetLanguage, overwrite: { name: true } } },
    );

    expect(res02.pluginTranslateProduct.length).toStrictEqual(1); // Name
    expect(res02.pluginTranslateProduct[0].translationKind).toStrictEqual(TKindProduct.NAME);

    const res03 = await adminClient.query<TranslateProductMutation, TranslateProductMutationVariables>(
      TRANSLATE_PRODUCT,
      { input: { productId, sourceLanguage, targetLanguage, overwrite: { name: false, description: true } } },
    );

    expect(res03.pluginTranslateProduct.length).toStrictEqual(1); // Description
    expect(res03.pluginTranslateProduct[0].translationKind).toStrictEqual(TKindProduct.DESCRIPTION);

    const res04 = await adminClient.query<TranslateProductMutation, TranslateProductMutationVariables>(
      TRANSLATE_PRODUCT,
      { input: { productId, sourceLanguage, targetLanguage, overwrite: { name: true, description: true } } },
    );

    expect(res04.pluginTranslateProduct.length).toStrictEqual(2); // Name, Description
    expect(res04.pluginTranslateProduct[0].translationKind).toStrictEqual(TKindProduct.NAME);
    expect(res04.pluginTranslateProduct[1].translationKind).toStrictEqual(TKindProduct.DESCRIPTION);
  });
});
