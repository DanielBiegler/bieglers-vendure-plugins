import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { LanguageCode } from "@vendure/core";
import { createTestEnvironment, SimpleGraphQLClient } from "@vendure/testing";
import path from "path";
import { afterAll, beforeAll, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { ChannelNotificationsPlugin } from "../src/plugin";
import { CreateMinimalChannelDocument, CreateMinimalNotificationDocument, CreateNotificationDocument, DeleteNotificationDocument, MarkAsReadDocument, ReadNotificationDocument, ReadNotificationListDocument, UpdateNotificationDocument } from "./types/generated-admin-types";

describe("ChannelNotificationsPlugin", { concurrent: true }, () => {
  const config = {
    ...testConfig(8001),
    importExportOptions: {
      importAssetsDir: path.join(__dirname, "fixtures"),
    },
    plugins: [
      AssetServerPlugin.init({
        route: "assets",
        assetUploadDir: path.join(__dirname, "fixtures"),
      }),
      ChannelNotificationsPlugin.init({}),
    ],
  };

  const newAdminClient = () => new SimpleGraphQLClient(config, `http://localhost:${config.apiOptions.port}/${config.apiOptions.adminApiPath!}`);

  const { server, adminClient: globalAdminClient } = createTestEnvironment(config);

  beforeAll(async () => {
    await server.init({
      productsCsvPath: path.join(__dirname, "../../../utils/e2e/e2e-products-full.csv"),
      initialData: initialData,
      customerCount: 2,
      logging: true,
    });
    await globalAdminClient.asSuperAdmin();
  }, 60000);

  afterAll(async () => {
    await server.destroy();
  });

  test("Successfully create notification", async ({ expect }) => {
    const response = await globalAdminClient.query(CreateNotificationDocument, {
      input: {
        dateTime: "2025-01-01T12:00:00Z",
        idAsset: "T_1",
        translations: [
          {
            languageCode: LanguageCode.en,
            title: "Test Notification",
            content: "This is a test notification.",
          },
          {
            languageCode: LanguageCode.de,
            title: "Testbenachrichtigung",
          }
        ]
      }
    });

    expect(response.CreateChannelNotification).toBeDefined();
    expect(response.CreateChannelNotification.title).toBe("Test Notification");
    expect(response.CreateChannelNotification.content).toBe("This is a test notification.");
    expect(response.CreateChannelNotification.dateTime).toBe("2025-01-01T12:00:00.000Z");
    expect(response.CreateChannelNotification.readAt).toBeNull();
    expect(response.CreateChannelNotification.asset?.id).toBe("T_1");
    expect(response.CreateChannelNotification.assetId).toBe("T_1");
    expect(response.CreateChannelNotification.translations).toHaveLength(2);
    expect(response.CreateChannelNotification.translations.map((t) => t.languageCode).sort()).toEqual(["de", "en"]);
    expect(response.CreateChannelNotification.translations.find((t) => t.languageCode === "de")?.title).toBe("Testbenachrichtigung");
    expect(response.CreateChannelNotification.translations.find((t) => t.languageCode === "de")?.content).toBeNull();
  });

  test("Successfully delete notification", async ({ expect }) => {
    const responseCreate = await globalAdminClient.query(CreateMinimalNotificationDocument, { title: "Test Notification to delete" });
    const id = responseCreate.CreateChannelNotification.id;

    const responseDelete = await globalAdminClient.query(DeleteNotificationDocument, { input: { id } });
    expect(responseDelete.DeleteChannelNotification.result).toBe("DELETED");

    // Fail to find it afterwards
    const responseRead = await globalAdminClient.query(ReadNotificationDocument, { id });
    expect(responseRead.channelNotification).toBeNull();
  });

  test("Successfully update notification", async ({ expect }) => {
    const responseCreate01 = await globalAdminClient.query(CreateMinimalNotificationDocument, { title: "Test Notification #1" });

    const updatedTitle = "Updated Title";
    const updatedContent = "Updated Content";
    const updatedDateTime = "1969-01-01T12:00:00.000Z";
    const updatedAssetId = "T_1";

    const responseUpdate01 = await globalAdminClient.query(UpdateNotificationDocument, {
      input: {
        id: responseCreate01.CreateChannelNotification.id,
        dateTime: updatedDateTime,
        idAsset: updatedAssetId,
        translations: [{
          languageCode: LanguageCode.en,
          title: updatedTitle,
          content: updatedContent,
        }]
      }
    });

    expect(responseUpdate01.UpdateChannelNotification).toBeDefined();
    expect(responseUpdate01.UpdateChannelNotification.dateTime).toBe(updatedDateTime);
    expect(responseUpdate01.UpdateChannelNotification.title).toBe(updatedTitle);
    expect(responseUpdate01.UpdateChannelNotification.content).toBe(updatedContent);
    expect(responseUpdate01.UpdateChannelNotification.assetId).toBe(updatedAssetId);
    expect(responseUpdate01.UpdateChannelNotification.asset?.id).toBe(updatedAssetId);

    // Unassign Asset

    const responseUpdate02 = await globalAdminClient.query(UpdateNotificationDocument, {
      input: {
        id: responseCreate01.CreateChannelNotification.id,
        idAsset: null!, // TODO Why does TS need the non null assert here? 
        // I confirmed the resolver does pass it correctly and the service gets the null.
      }
    });

    expect(responseUpdate02.UpdateChannelNotification).toBeDefined();
    expect(responseUpdate02.UpdateChannelNotification.dateTime).toBe(updatedDateTime);
    expect(responseUpdate02.UpdateChannelNotification.title).toBe(updatedTitle);
    expect(responseUpdate02.UpdateChannelNotification.content).toBe(updatedContent);
    expect(responseUpdate02.UpdateChannelNotification.assetId).toBeNull();
    expect(responseUpdate02.UpdateChannelNotification.asset?.id).toBeUndefined();
  });

  test("Successfully read notification", async ({ expect }) => {
    const title = "Test Notification #1";
    const responseCreate01 = await globalAdminClient.query(CreateMinimalNotificationDocument, { title });
    const responseRead = await globalAdminClient.query(ReadNotificationDocument, { id: responseCreate01.CreateChannelNotification.id });

    expect(responseRead.channelNotification?.id).toBeDefined();
    expect(responseRead.channelNotification?.title).toBe(title);
    expect(responseRead.channelNotification?.translations.length).toBe(1);
  });

  test("Fail to read notification due non-existent ID", async ({ expect }) => {
    const responseRead = await globalAdminClient.query(ReadNotificationDocument, { id: 1337 });
    expect(responseRead.channelNotification).toBeNull();
  });

  test("Successfully read paginated notifications, default order DESC", async ({ expect, task }) => {
    const adminClient = newAdminClient();
    await adminClient.asSuperAdmin();
    const responseChannel = await adminClient.query(CreateMinimalChannelDocument, { code: task.id, token: task.id });
    adminClient.setChannelToken((responseChannel.createChannel as { token: string }).token);

    const title01 = "#1";
    const dateTime01 = "1999-01-01T12:00:00.000Z";
    const title02 = "#2";
    const dateTime02 = "2000-01-01T12:00:00.000Z";

    const responseCreate01 = await adminClient.query(CreateMinimalNotificationDocument, { title: title01, dateTime: dateTime01 });
    const responseCreate02 = await adminClient.query(CreateMinimalNotificationDocument, { title: title02, dateTime: dateTime02 });
    const responseRead = await adminClient.query(ReadNotificationListDocument);

    expect(responseRead.channelNotificationList.totalItems).toBe(2);
    expect(responseRead.channelNotificationList.items.length).toBe(2);

    expect(responseRead.channelNotificationList.items[0].id).toBe(responseCreate02.CreateChannelNotification.id);
    expect(responseRead.channelNotificationList.items[0].title).toBe(title02);
    expect(responseRead.channelNotificationList.items[0].dateTime).toBe(dateTime02);

    expect(responseRead.channelNotificationList.items[1].id).toBe(responseCreate01.CreateChannelNotification.id);
    expect(responseRead.channelNotificationList.items[1].title).toBe(title01);
    expect(responseRead.channelNotificationList.items[1].dateTime).toBe(dateTime01);
  });

  test("Successfully mark notification as read", async ({ expect }) => {
    const responseCreate = await globalAdminClient.query(CreateMinimalNotificationDocument, { title: "#1" });

    const responseMark = await globalAdminClient.query(MarkAsReadDocument, { input: { id: responseCreate.CreateChannelNotification.id, } });
    const responseRead = await globalAdminClient.query(ReadNotificationDocument, { id: responseCreate.CreateChannelNotification.id });

    expect(responseMark.MarkChannelNotificationAsRead.success).toBe(true);
    expect(responseRead.channelNotification?.readAt).toBeDefined();
  });

  test("Successfully mark notification as read with custom fields", async ({ expect }) => {
    const responseCreate = await globalAdminClient.query(CreateMinimalNotificationDocument, { title: "#1" });

    const responseMark = await globalAdminClient.query(MarkAsReadDocument, {
      input: {
        id: responseCreate.CreateChannelNotification.id,
        readReceiptCustomFields: { example: "Example Custom Field String" }
      }
    });
    expect(responseMark.MarkChannelNotificationAsRead.success).toBe(true);

    const responseRead = await globalAdminClient.query(ReadNotificationDocument, { id: responseCreate.CreateChannelNotification.id });
    expect(responseRead.channelNotification?.readAt).toBeDefined();
  });

  test("Successfully mark notifications as read twice", async ({ expect }) => {
    const responseCreate01 = await globalAdminClient.query(CreateMinimalNotificationDocument, { title: "#1" });

    const responseMark01 = await globalAdminClient.query(MarkAsReadDocument, { input: { id: responseCreate01.CreateChannelNotification.id } });
    expect(responseMark01.MarkChannelNotificationAsRead.success).toBe(true);

    const responseMark02 = await globalAdminClient.query(MarkAsReadDocument, { input: { id: responseCreate01.CreateChannelNotification.id } });
    expect(responseMark02.MarkChannelNotificationAsRead.success).toBe(true);
  });

  test("Fails marking notifications as read due to non-existent ID", async ({ expect }) => {
    await expect(globalAdminClient.query(MarkAsReadDocument, { input: { id: 1337 } })).rejects.toThrow();
  });
});
