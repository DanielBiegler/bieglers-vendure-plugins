import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { createTestEnvironment } from "@vendure/testing";
import gql from "graphql-tag";
import path from "path";
import { afterAll, beforeAll, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { UserNotificationsPlugin } from "../src/plugin";

describe("UserNotificationsPlugin", { concurrent: true }, () => {
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
      UserNotificationsPlugin.init({}),
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

  test("Create", async ({ expect }) => {
    const response = await adminClient.query(gql`
      mutation {
        userNotificationCreate(input: {
          dateTime: "2025-01-01T12:00:00Z",
          translations: [
            {
              languageCode: en,
              title: "Test Notification",
              content: "This is a test notification.",
              # idAsset: "T_1"
            },
            {
              languageCode: de,
              title: "Testbenachrichtigung",
              idAsset: "T_2"
            }
          ]
        }) {
          id
          createdAt
          updatedAt
          asset { id }
          title
          dateTime
          content
          readAt
          translations { languageCode title content asset { id } }
        }
      }
    `);

    console.log(JSON.stringify(response, null, 2));

    expect(response.userNotificationCreate).toBeDefined();
    expect(response.userNotificationCreate.title).toBe("Test Notification");
    expect(response.userNotificationCreate.content).toBe("This is a test notification.");
    expect(response.userNotificationCreate.dateTime).toBe("2025-01-01T12:00:00.000Z");
    expect(response.userNotificationCreate.readAt).toBeNull();
    expect(response.userNotificationCreate.asset).toBeNull();
    expect(response.userNotificationCreate.translations).toHaveLength(2);
    expect(response.userNotificationCreate.translations[0].asset).toBeNull();
    expect(response.userNotificationCreate.translations[1].asset.id).toBe("T_2");
    expect(response.userNotificationCreate.translations.map((t: any) => t.languageCode).sort()).toEqual(["de", "en"]);
    expect(response.userNotificationCreate.translations.find((t: any) => t.languageCode === "de").title).toBe("Testbenachrichtigung");
    expect(response.userNotificationCreate.translations.find((t: any) => t.languageCode === "de").content).toBeNull();
  });
});
