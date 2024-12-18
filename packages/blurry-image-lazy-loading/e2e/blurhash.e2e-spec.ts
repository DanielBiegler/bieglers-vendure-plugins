import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { AssetImporter } from "@vendure/core";
import { createTestEnvironment } from "@vendure/testing";
import path from "path";
import { afterAll, assert, beforeAll, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { BlurHashStrategy } from "../src/config/BlurHashStrategy";
import { PluginPreviewImageHashResultCode as CODE } from "../src/generated-admin-types";
import { PreviewImageHashPlugin } from "../src/preview-image-hash.plugin";
import { CREATE_PREVIEW_IMG_HASH } from "./graphql/admin-e2e-definitions";
import { CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables } from "./types/generated-admin-types";

describe("BlurHashStrategy", () => {
  const { server, adminClient, shopClient } = createTestEnvironment({
    ...testConfig(8001),
    importExportOptions: {
      importAssetsDir: path.join(__dirname, "fixtures"),
    },
    plugins: [
      AssetServerPlugin.init({
        route: "assets",
        assetUploadDir: path.join(__dirname, "fixtures"),
      }),
      PreviewImageHashPlugin.init({
        hashingStrategy: new BlurHashStrategy(),
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

    const fixturesAssets = [
      /* T_1 */ "vendure-brand-icon-2024-primary.jpeg",
      /* T_2 */ "vendure-brand-icon-2024-primary.png",
      /* T_3 */ "vendure-brand-icon-2024-primary.svg",
      /* T_4 */ "vendure-brand-icon-2024-primary.webp",
      /* T_5 */ "vendure-brand-icon-2024-primary.avif",
    ];

    await server.app.get(AssetImporter).getAssets(fixturesAssets);
  }, 60000);

  afterAll(async () => {
    await server.destroy();
  });

  test("Successfully generate blurhash for png image with default dimensions", async ({ expect }) => {
    await adminClient.asSuperAdmin();
    const result = await adminClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
      CREATE_PREVIEW_IMG_HASH,
      {
        input: {
          idAsset: "T_2",
          runSynchronously: true,
        },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHash.__typename === "Asset");
    expect(result.pluginPreviewImageHashCreateImageHash.mimeType).toBe("image/png");
    expect(result.pluginPreviewImageHashCreateImageHash.customFields?.previewImageHash).toBe(
      "TFc0alE6a0RqR2tEbEFmN3B5ZmxVW2Y1WnplLg==",
    );
  });

  test("Successfully generate blurhash for png image with size: 12 x 34 px", async ({ expect }) => {
    await adminClient.asSuperAdmin();
    const result = await adminClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
      CREATE_PREVIEW_IMG_HASH,
      {
        input: {
          idAsset: "T_2",
          runSynchronously: true,
          width: 12,
          height: 34,
        },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHash.__typename === "Asset");
    expect(result.pluginPreviewImageHashCreateImageHash.mimeType).toBe("image/png");
    expect(result.pluginPreviewImageHashCreateImageHash.customFields?.previewImageHash).toBe(
      "TEw0c2wkcExwZnB5VWJlbnBMYnVrcmZsalhiYw==",
    );
  });

  test("Successfully generate blurhash for png image with size: 12 x Auto px", async ({ expect }) => {
    await adminClient.asSuperAdmin();
    const result = await adminClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
      CREATE_PREVIEW_IMG_HASH,
      {
        input: {
          idAsset: "T_2",
          runSynchronously: true,
          width: 12,
        },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHash.__typename === "Asset");
    expect(result.pluginPreviewImageHashCreateImageHash.mimeType).toBe("image/png");
    expect(result.pluginPreviewImageHashCreateImageHash.customFields?.previewImageHash).toBe(
      "TGY1ZGFIcEtqd3BLcHlrVm9+az1lbWpbaltqRg==",
    );
  });

  test("Successfully generate blurhash for png image with size: Auto x 34 px", async ({ expect }) => {
    await adminClient.asSuperAdmin();
    const result = await adminClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
      CREATE_PREVIEW_IMG_HASH,
      {
        input: {
          idAsset: "T_2",
          runSynchronously: true,
          height: 34,
        },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHash.__typename === "Asset");
    expect(result.pluginPreviewImageHashCreateImageHash.mimeType).toBe("image/png");
    expect(result.pluginPreviewImageHashCreateImageHash.customFields?.previewImageHash).toBe(
      "TFk0QEdoa0RrWGtEa0BmOHB5ZmxhSmY2WnplLg==",
    );
  });

  test("Successfully generate blurhash for webp image with default dimensions", async ({ expect }) => {
    await adminClient.asSuperAdmin();
    const result = await adminClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
      CREATE_PREVIEW_IMG_HASH,
      {
        input: {
          idAsset: "T_4",
          runSynchronously: true,
        },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHash.__typename === "Asset");
    expect(result.pluginPreviewImageHashCreateImageHash.mimeType).toBe("image/webp");
    expect(result.pluginPreviewImageHashCreateImageHash.customFields?.previewImageHash).toBe(
      "TFY4SCUqa0RXRWJjdC1hemN1Vz1tUGFlWmZqWQ==",
    );
  });

  test("Successfully generate blurhash for avif image with default dimensions", async ({ expect }) => {
    await adminClient.asSuperAdmin();
    const result = await adminClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
      CREATE_PREVIEW_IMG_HASH,
      {
        input: {
          idAsset: "T_5",
          runSynchronously: true,
        },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHash.__typename === "Asset");
    expect(result.pluginPreviewImageHashCreateImageHash.mimeType).toBe("image/avif");
    expect(result.pluginPreviewImageHashCreateImageHash.customFields?.previewImageHash).toBe(
      "TFk1U3NRal1iSWtXaz9hI3B5YmJaTGY1WnphZQ==",
    );
  });

  test("Successfully generate blurhash for jpeg image with default dimensions", async ({ expect }) => {
    await adminClient.asSuperAdmin();
    const result = await adminClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
      CREATE_PREVIEW_IMG_HASH,
      {
        input: {
          idAsset: "T_1",
          runSynchronously: true,
        },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHash.__typename === "Asset");
    expect(result.pluginPreviewImageHashCreateImageHash.mimeType).toBe("image/jpeg");
    expect(result.pluginPreviewImageHashCreateImageHash.customFields?.previewImageHash).toBe(
      "TFdLV0ZYdDhSLm96SkRhfTAqV1h9OmpAPV1vTA==",
    );
  });

  test("Fail to generate blurhash for svg image", async ({ expect }) => {
    await adminClient.asSuperAdmin();
    const result = await adminClient.query<CreatePreviewImageHashMutation, CreatePreviewImageHashMutationVariables>(
      CREATE_PREVIEW_IMG_HASH,
      {
        input: {
          idAsset: "T_3",
          runSynchronously: true,
        },
      },
    );

    assert(result.pluginPreviewImageHashCreateImageHash.__typename === "PluginPreviewImageHashResult");
    expect(result.pluginPreviewImageHashCreateImageHash.jobsAddedToQueue).toStrictEqual(0);
    expect(result.pluginPreviewImageHashCreateImageHash.code).toBe(CODE.WRONG_MIMETYPE);
  });
});
