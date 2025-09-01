import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { LanguageCode } from "@vendure/core";
import { createTestEnvironment, E2E_DEFAULT_CHANNEL_TOKEN } from "@vendure/testing";
import gql from "graphql-tag";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { UserNotificationsPlugin } from "../src/plugin";
import { CreateMinimalChannelDocument, CreateMinimalNotificationDocument, ReadNotificationDocument, ReadNotificationListDocument, UpdateNotificationDocument } from "./types/generated-admin-types";

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

  test("Successfully delete multiple on channel", async ({ expect, task }) => {
    const responseChannel = await adminClient.query(CreateMinimalChannelDocument, { code: task.id, token: task.id });
    adminClient.setChannelToken((responseChannel.createChannel as { token: string }).token);

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

  test("Successfully read notification", async ({ expect }) => {
    const title = "Test Notification #1";
    const responseCreate01 = await adminClient.query(CreateMinimalNotificationDocument, { title });
    const responseRead = await adminClient.query(ReadNotificationDocument, { id: responseCreate01.userNotificationCreate.id });

    expect(responseRead.userNotification?.id).toBeDefined();
    expect(responseRead.userNotification?.title).toBe(title);
    expect(responseRead.userNotification?.translations.length).toBe(1);
  });

  test("Fail to read notification due non-existent ID", async ({ expect }) => {
    const responseRead = await adminClient.query(ReadNotificationDocument, { id: 1337 });
    expect(responseRead.userNotification).toBeNull();
  });

  test("Successfully read paginated notifications, default order DESC", async ({ expect, task }) => {
    const responseChannel = await adminClient.query(CreateMinimalChannelDocument, { code: task.id, token: task.id });
    adminClient.setChannelToken((responseChannel.createChannel as { token: string }).token);

    const title01 = "#1";
    const dateTime01 = "1999-01-01T12:00:00.000Z";
    const title02 = "#2";
    const dateTime02 = "2000-01-01T12:00:00.000Z";

    const responseCreate01 = await adminClient.query(CreateMinimalNotificationDocument, { title: title01, dateTime: dateTime01 });
    const responseCreate02 = await adminClient.query(CreateMinimalNotificationDocument, { title: title02, dateTime: dateTime02 });
    const responseRead = await adminClient.query(ReadNotificationListDocument);

    expect(responseRead.userNotificationList.totalItems).toBe(2);
    expect(responseRead.userNotificationList.items.length).toBe(2);

    expect(responseRead.userNotificationList.items[0].id).toBe(responseCreate02.userNotificationCreate.id);
    expect(responseRead.userNotificationList.items[0].title).toBe(title02);
    expect(responseRead.userNotificationList.items[0].dateTime).toBe(dateTime02);

    expect(responseRead.userNotificationList.items[1].id).toBe(responseCreate01.userNotificationCreate.id);
    expect(responseRead.userNotificationList.items[1].title).toBe(title01);
    expect(responseRead.userNotificationList.items[1].dateTime).toBe(dateTime01);
  });

  // TODO findAll
  // TODO mark as read
});
