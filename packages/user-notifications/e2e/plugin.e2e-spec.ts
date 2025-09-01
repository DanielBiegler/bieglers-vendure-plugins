import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { LanguageCode } from "@vendure/core";
import { createTestEnvironment, E2E_DEFAULT_CHANNEL_TOKEN } from "@vendure/testing";
import gql from "graphql-tag";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { UserNotificationsPlugin } from "../src/plugin";
import { CreateMinimalNotificationDocument, UpdateNotificationDocument } from "./types/generated-admin-types";

// Sequential to test different channel tokens
// Running concurrently easily breaks because `.setChannelToken` mutates the client
describe("UserNotificationsPlugin", { sequential: true }, () => {
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

  let testChannelFooId: string;
  let testChannelFooToken: string;
  let testChannelBarId: string;
  let testChannelBarToken: string;

  beforeAll(async () => {
    await server.init({
      productsCsvPath: path.join(__dirname, "../../../utils/e2e/e2e-products-full.csv"),
      initialData: initialData,
      customerCount: 2,
      logging: true,
    });
    await adminClient.asSuperAdmin();
    const channelCreateFooResponse = await adminClient.query(gql`
      mutation {
        createChannel(input: {
          code: "test-channel-foo",
          token: "test-token-foo",
          defaultLanguageCode: en,
          pricesIncludeTax: true,
          currencyCode: USD,
          defaultShippingZoneId: "T_1",
          defaultTaxZoneId: "T_1"
        }) {
          ... on Channel {
            id
            token
          }
        }
      }
    `);
    testChannelFooId = channelCreateFooResponse.createChannel.id;
    testChannelFooToken = channelCreateFooResponse.createChannel.token;
    const channelCreateBarResponse = await adminClient.query(gql`
      mutation {
        createChannel(input: {
          code: "test-channel-bar",
          token: "test-token-bar",
          defaultLanguageCode: en,
          pricesIncludeTax: true,
          currencyCode: USD,
          defaultShippingZoneId: "T_1",
          defaultTaxZoneId: "T_1"
        }) {
          ... on Channel {
            id
            token
          }
        }
      }
    `);
    testChannelBarId = channelCreateBarResponse.createChannel.id;
    testChannelBarToken = channelCreateBarResponse.createChannel.token;
  }, 60000);

  afterAll(async () => {
    await server.destroy();
  });

  beforeEach(() => {
    adminClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);
  });

  test("Create", async ({ expect }) => {
    const response = await adminClient.query(gql`
      mutation {
        userNotificationCreate(input: {
          dateTime: "2025-01-01T12:00:00Z",
          idAsset: "T_1",
          translations: [
            {
              languageCode: en,
              title: "Test Notification",
              content: "This is a test notification.",
            },
            {
              languageCode: de,
              title: "Testbenachrichtigung",
            }
          ]
        }) {
          id
          createdAt
          updatedAt
          asset { id }
          assetId
          title
          dateTime
          content
          readAt
          translations { languageCode title content }
        }
      }
    `);

    expect(response.userNotificationCreate).toBeDefined();
    expect(response.userNotificationCreate.title).toBe("Test Notification");
    expect(response.userNotificationCreate.content).toBe("This is a test notification.");
    expect(response.userNotificationCreate.dateTime).toBe("2025-01-01T12:00:00.000Z");
    expect(response.userNotificationCreate.readAt).toBeNull();
    expect(response.userNotificationCreate.asset?.id).toBe("T_1");
    expect(response.userNotificationCreate.assetId).toBe("T_1");
    expect(response.userNotificationCreate.translations).toHaveLength(2);
    expect(response.userNotificationCreate.translations.map((t: any) => t.languageCode).sort()).toEqual(["de", "en"]);
    expect(response.userNotificationCreate.translations.find((t: any) => t.languageCode === "de").title).toBe("Testbenachrichtigung");
    expect(response.userNotificationCreate.translations.find((t: any) => t.languageCode === "de").content).toBeNull();
  });

  test("Successfully delete multiple on channel", async ({ expect }) => {
    adminClient.setChannelToken(testChannelFooToken);
    const responseCreate01 = await adminClient.query(CreateMinimalNotificationDocument, { title: "Test Notification #1" });
    const responseCreate02 = await adminClient.query(CreateMinimalNotificationDocument, { title: "Test Notification #2" });

    const responseDelete = await adminClient.query(gql`
      mutation {
        userNotificationDelete(ids: [
          "${responseCreate01.userNotificationCreate.id}",
          "${responseCreate02.userNotificationCreate.id}"
        ]) {
          result
          message
        }
      }
    `);

    expect(responseDelete.userNotificationDelete).toBeDefined();
    expect(responseDelete.userNotificationDelete.result).toBe("DELETED");
    expect(responseDelete.userNotificationDelete.message).toBe("2 of 2 UserNotifications deleted");
  });

  test("Successfully update notification", async ({ expect }) => {
    const responseCreate01 = await adminClient.query(CreateMinimalNotificationDocument, { title: "Test Notification #1" });

    const updatedTitle = "Updated Title";
    const updatedContent = "Updated Content";
    const updatedDateTime = "1969-01-01T12:00:00.000Z";
    const updatedAssetId = "T_1";

    const responseUpdate01 = await adminClient.query(UpdateNotificationDocument, {
      input: {
        id: responseCreate01.userNotificationCreate.id,
        dateTime: updatedDateTime,
        idAsset: updatedAssetId,
        translations: [{
          languageCode: LanguageCode.en,
          title: updatedTitle,
          content: updatedContent,
        }]
      }
    });

    expect(responseUpdate01.userNotificationUpdate).toBeDefined();
    expect(responseUpdate01.userNotificationUpdate.dateTime).toBe(updatedDateTime);
    expect(responseUpdate01.userNotificationUpdate.title).toBe(updatedTitle);
    expect(responseUpdate01.userNotificationUpdate.content).toBe(updatedContent);
    expect(responseUpdate01.userNotificationUpdate.assetId).toBe(updatedAssetId);
    expect(responseUpdate01.userNotificationUpdate.asset?.id).toBe(updatedAssetId);

    // Unassign Asset

    const responseUpdate02 = await adminClient.query(UpdateNotificationDocument, {
      input: {
        id: responseCreate01.userNotificationCreate.id,
        idAsset: null!, // TODO Why does TS need the non null assert here? 
        // I confirmed the resolver does pass it correctly and the service gets the null.
      }
    });

    expect(responseUpdate02.userNotificationUpdate).toBeDefined();
    expect(responseUpdate02.userNotificationUpdate.dateTime).toBe(updatedDateTime);
    expect(responseUpdate02.userNotificationUpdate.title).toBe(updatedTitle);
    expect(responseUpdate02.userNotificationUpdate.content).toBe(updatedContent);
    expect(responseUpdate02.userNotificationUpdate.assetId).toBeNull();
    expect(responseUpdate02.userNotificationUpdate.asset?.id).toBeUndefined();
  });
});
