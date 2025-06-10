import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { createTestEnvironment } from "@vendure/testing";
import path from "path";
import { afterAll, assert, beforeAll, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { ThumbHashStrategy } from "../src/config/ThumbHashStrategy";
import { PluginPreviewImageHashResultCode as CODE } from "../src/generated-admin-types";
import { PreviewImageHashPlugin } from "../src/preview-image-hash.plugin";
import { CREATE_FOR_ALL_ASSETS, CREATE_FOR_COLLECTION, CREATE_FOR_PRODUCT, CREATE_PREVIEW_IMG_HASH } from "./graphql/admin-e2e-definitions";
import {
  CreateForAllAssetsMutation,
  CreateForAllAssetsMutationVariables,
  CreateForCollectionMutation,
  CreateForCollectionMutationVariables,
  CreateForProductMutation,
  CreateForProductMutationVariables,
  CreatePreviewImageHashMutation,
  CreatePreviewImageHashMutationVariables,
} from "./types/generated-admin-types";

describe("General API", () => {
  const { server, adminClient, shopClient } = createTestEnvironment({
    ...testConfig(8002),
    importExportOptions: {
      importAssetsDir: path.join(__dirname, "fixtures"),
    },
    plugins: [
      AssetServerPlugin.init({
        route: "assets",
        assetUploadDir: path.join(__dirname, "fixtures"),
      }),
      PreviewImageHashPlugin.init({
        hashingStrategy: new ThumbHashStrategy(),
      }),
    ],
  });

  beforeAll(async () => {
    await server.init({
      productsCsvPath: path.join(__dirname, "../../../utils/e2e/e2e-products-full.csv"),
      initialData: initialData,
      customerCount: 2,
      logging: true,
    });
    await adminClient.asSuperAdmin();
  }, 60000);

  afterAll(async () => {
    await server.destroy();
  });

  test("Successfully enqueue hashing for collection with default arguments", async ({ expect }) => {
    const result = await adminClient.query<CreateForCollectionMutation, CreateForCollectionMutationVariables>(
      CREATE_FOR_COLLECTION,
      { input: { idCollection: "1" } },
    );

    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.code).toBe(CODE.OK);
    // TODO would be good to seed a more practical env
    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.jobsAddedToQueue).toStrictEqual(0);
    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.assetsSkipped).toStrictEqual(0);
  });

  test("Successfully enqueue hashing for collection with batch size zero", async ({ expect }) => {
    const result = await adminClient.query<CreateForCollectionMutation, CreateForCollectionMutationVariables>(
      CREATE_FOR_COLLECTION,
      { input: { idCollection: "1", batchSize: 0 } },
    );

    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.code).toBe(CODE.OK);
    // TODO would be good to seed a more practical env
    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.jobsAddedToQueue).toStrictEqual(0);
    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.assetsSkipped).toStrictEqual(0);
  });

  test("Successfully enqueue hashing for collection with negative batch size", async ({ expect }) => {
    const result = await adminClient.query<CreateForCollectionMutation, CreateForCollectionMutationVariables>(
      CREATE_FOR_COLLECTION,
      { input: { idCollection: "1", batchSize: -1 } },
    );

    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.code).toBe(CODE.OK);
    // TODO would be good to seed a more practical env
    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.jobsAddedToQueue).toStrictEqual(0);
    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.assetsSkipped).toStrictEqual(0);
  });

  test("Successfully add task to job queue", async ({ expect }) => {
    const result = await adminClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
      CREATE_PREVIEW_IMG_HASH,
      {
        input: {
          idAsset: "T_1",
          runSynchronously: false,
        },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHash.__typename === "PluginPreviewImageHashResult");
    expect(result.pluginPreviewImageHashCreateImageHash.code).toBe(CODE.OK);
    expect(result.pluginPreviewImageHashCreateImageHash.jobsAddedToQueue).toStrictEqual(1);
    expect(result.pluginPreviewImageHashCreateImageHash.assetsSkipped).toStrictEqual(0);
  });

  test("Successfully enqueue job for product", async ({ expect }) => {
    const result = await adminClient.query<CreateForProductMutation, CreateForProductMutationVariables>(
      CREATE_FOR_PRODUCT,
      {
        input: { idProduct: "T_1" },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHashesForProduct.__typename === "PluginPreviewImageHashResult");
    expect(result.pluginPreviewImageHashCreateImageHashesForProduct.code).toBe(CODE.OK);
    expect(result.pluginPreviewImageHashCreateImageHashesForProduct.jobsAddedToQueue).toStrictEqual(1);
    expect(result.pluginPreviewImageHashCreateImageHashesForProduct.assetsSkipped).toStrictEqual(0);
  });

  test("Successfully enqueue jobs for hashing all assets", async ({ expect }) => {
    const result = await adminClient.query<CreateForAllAssetsMutation, CreateForAllAssetsMutationVariables>(
      CREATE_FOR_ALL_ASSETS,
    );

    assert(result.pluginPreviewImageHashCreateImageHashesForAllAssets.__typename === "PluginPreviewImageHashResult");
    expect(result.pluginPreviewImageHashCreateImageHashesForAllAssets.code).toBe(CODE.OK);
    expect(result.pluginPreviewImageHashCreateImageHashesForAllAssets.jobsAddedToQueue).toStrictEqual(5);
    expect(result.pluginPreviewImageHashCreateImageHashesForAllAssets.assetsSkipped).toStrictEqual(0);
  });

  test("Successfully enqueue hashing for all assets with negative batch size", async ({ expect }) => {
    const result = await adminClient.query<CreateForAllAssetsMutation, CreateForAllAssetsMutationVariables>(
      CREATE_FOR_ALL_ASSETS,
      { input: { batchSize: -1 } },
    );

    assert(result.pluginPreviewImageHashCreateImageHashesForAllAssets.__typename === "PluginPreviewImageHashResult");
    expect(result.pluginPreviewImageHashCreateImageHashesForAllAssets.code).toBe(CODE.OK);
    expect(result.pluginPreviewImageHashCreateImageHashesForAllAssets.jobsAddedToQueue).toStrictEqual(5);
    expect(result.pluginPreviewImageHashCreateImageHashesForAllAssets.assetsSkipped).toStrictEqual(0);
  });

  test("Successfully enqueue hashing for all assets with regenerating existing hashes", async ({ expect }) => {
    const result = await adminClient.query<CreateForAllAssetsMutation, CreateForAllAssetsMutationVariables>(
      CREATE_FOR_ALL_ASSETS,
      { input: { regenerateExistingHashes: true } },
    );

    assert(result.pluginPreviewImageHashCreateImageHashesForAllAssets.__typename === "PluginPreviewImageHashResult");
    expect(result.pluginPreviewImageHashCreateImageHashesForAllAssets.code).toBe(CODE.OK);
    expect(result.pluginPreviewImageHashCreateImageHashesForAllAssets.jobsAddedToQueue).toStrictEqual(5);
    expect(result.pluginPreviewImageHashCreateImageHashesForAllAssets.assetsSkipped).toStrictEqual(0);
  });


  test("Fail to enqueue job for non-existent product", async ({ expect }) => {
    const result = await adminClient.query<CreateForProductMutation, CreateForProductMutationVariables>(
      CREATE_FOR_PRODUCT,
      {
        input: { idProduct: "non-existent-product-id" },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHashesForProduct.__typename === "PluginPreviewImageHashResult");
    expect(result.pluginPreviewImageHashCreateImageHashesForProduct.code).toBe(CODE.ENTITY_NOT_FOUND);
    expect(result.pluginPreviewImageHashCreateImageHashesForProduct.jobsAddedToQueue).toStrictEqual(0);
    expect(result.pluginPreviewImageHashCreateImageHashesForProduct.assetsSkipped).toStrictEqual(0);
  });

  test("Fail to enqueue hashing for collection due to non-existing collection id", async ({ expect }) => {
    const result = await adminClient.query<CreateForCollectionMutation, CreateForCollectionMutationVariables>(
      CREATE_FOR_COLLECTION,
      { input: { idCollection: "non-existent-collection-id" } },
    );

    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.code).toBe(CODE.ENTITY_NOT_FOUND);
    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.jobsAddedToQueue).toStrictEqual(0);
    expect(result.pluginPreviewImageHashCreateImageHashesForCollection.assetsSkipped).toStrictEqual(0);
  });

  test("Fail to generate hash due to non-existent asset via api", async ({ expect }) => {
    const result = await adminClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
      CREATE_PREVIEW_IMG_HASH,
      {
        input: {
          idAsset: "non-existent-asset",
          runSynchronously: true,
        },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHash.__typename === "PluginPreviewImageHashResult");
    expect(result.pluginPreviewImageHashCreateImageHash.code).toBe(CODE.ENTITY_NOT_FOUND);
    expect(result.pluginPreviewImageHashCreateImageHash.jobsAddedToQueue).toStrictEqual(0);
    expect(result.pluginPreviewImageHashCreateImageHash.assetsSkipped).toStrictEqual(0);
  });

  test("Fail to generate hash due to insufficient permissions", async ({ expect }) => {
    await adminClient.asAnonymousUser();
    await expect(
      adminClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
        CREATE_PREVIEW_IMG_HASH,
        {
          input: {
            idAsset: "non-existent-asset",
            runSynchronously: true,
          },
        },
      ),
    ).rejects.toThrowError("You are not currently authorized to perform this action");
  });

  test("Fail to enqueue hashing for collection due to insufficient permissions", async ({ expect }) => {
    await adminClient.asAnonymousUser();
    await expect(
      adminClient.query<CreateForCollectionMutation, CreateForCollectionMutationVariables>(CREATE_FOR_COLLECTION, {
        input: { idCollection: "1" },
      }),
    ).rejects.toThrowError("You are not currently authorized to perform this action");
  });

  test("Fail to create via shop api, as its an admin only mutation", async ({ expect }) => {
    await expect(
      shopClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
        CREATE_PREVIEW_IMG_HASH,
        {
          input: {
            idAsset: "non-existent-asset",
            runSynchronously: true,
          },
        },
      ),
    ).rejects.toThrowError('Unknown type "PluginPreviewImageHashCreateInput".');
  });
});
