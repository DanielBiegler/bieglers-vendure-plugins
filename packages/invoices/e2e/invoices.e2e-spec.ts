import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { LocalAssetStorageStrategy } from "@vendure/asset-server-plugin/lib/src/config/local-asset-storage-strategy";
import {
  ChannelService,
  LanguageCode,
  PaymentMethodHandler,
  TransactionalConnection
} from "@vendure/core";
import { createTestEnvironment, E2E_DEFAULT_CHANNEL_TOKEN } from "@vendure/testing";
import { createHmac } from "node:crypto";
import path from "path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertNoFailedJobs, awaitRunningJobs } from "../../../utils/e2e/await-running-jobs";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { DebugSnapshotStrategy, DEFAULT_SEQUENCE_CODE } from "../src";
import { DebugFileStrategy } from "../src/config/FileStrategy";
import { StaticSequentialIdStrategy } from "../src/config/SequentialIdStrategy";
import { InvoiceSequence } from "../src/entities/Sequence.entity";
import { InvoicesPlugin } from "../src/plugin";
import {
  ASSIGN_PAYMENT_METHODS_TO_CHANNEL,
  ASSIGN_PRODUCTS_TO_CHANNEL,
  ASSIGN_SHIPPING_METHODS_TO_CHANNEL,
  ASSIGN_STOCK_LOCATIONS_TO_CHANNEL,
  CREATE_CHANNEL,
  CREATE_INVOICE_DOWNLOAD_URL,
  CREATE_PAYMENT_METHOD,
  GET_INVOICE_LIST,
  GET_ACTIVE_CHANNEL,
  GET_PAYMENT_METHODS,
  GET_SHIPPING_METHODS,
  GET_STOCK_LOCATIONS,
  GET_ZONES,
} from "./graphql/admin-e2e-definitions";
import {
  ADD_ITEM_TO_ORDER,
  ADD_PAYMENT_TO_ORDER,
  GET_ELIGIBLE_SHIPPING_METHODS,
  GET_PRODUCT_WITH_VARIANTS,
  SET_CUSTOMER_FOR_ORDER,
  SET_ORDER_SHIPPING_ADDRESS,
  SET_ORDER_SHIPPING_METHOD,
  TRANSITION_ORDER_TO_STATE,
} from "./graphql/shop-e2e-definitions";

const TEST_PAYMENT_METHOD_CODE = "test-payment-method";

const testPaymentHandler = new PaymentMethodHandler({
  code: TEST_PAYMENT_METHOD_CODE,
  description: [{ languageCode: LanguageCode.en, value: "Test Payment Method" }],
  args: {},
  createPayment: (_ctx, _order, amount) => ({
    amount,
    state: "Settled" as const,
    transactionId: `test-${Date.now()}`,
    metadata: {},
  }),
  settlePayment: () => ({ success: true }),
});

describe("InvoicesPlugin", { sequential: true }, () => {

  const INITIAL_SEQUENCE_INVOICE = 1337;
  const INVOICE_PREFIX = "SINGLE-VENDOR-INVOICE";
  const DOWNLOAD_SIGNING_SECRET = "e2e-download-signing-secret";

  const { server, adminClient, shopClient } = createTestEnvironment({
    ...testConfig(8001),
    paymentOptions: {
      paymentMethodHandlers: [testPaymentHandler],
    },
    importExportOptions: {
      importAssetsDir: path.join(__dirname, "fixtures"),
    },
    plugins: [
      AssetServerPlugin.init({
        route: "assets",
        assetUploadDir: path.join(__dirname, "fixtures"),
      }),
      InvoicesPlugin.init({
        prefixStrategy: new StaticSequentialIdStrategy(INVOICE_PREFIX),
        fileStrategy: new DebugFileStrategy(),
        storageStrategy: new LocalAssetStorageStrategy(path.join(__dirname, "test-invoices")),
        sequenceLeftPadCount: 4,
        subscribeToOrderPlacedEvent: true,
        initialSequence: INITIAL_SEQUENCE_INVOICE,
        snapshotStrategy: new DebugSnapshotStrategy(),
        download: { signingSecret: DOWNLOAD_SIGNING_SECRET },

        // IMPORTANT - This e2e suite specifically tests sharing the sequence across channels!
        perChannelConfig: false,
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

    await adminClient.query(CREATE_PAYMENT_METHOD, {
      input: {
        code: TEST_PAYMENT_METHOD_CODE,
        enabled: true,
        translations: [
          { languageCode: "en", name: "Test Payment Method", description: "" },
        ],
        handler: { code: TEST_PAYMENT_METHOD_CODE, arguments: [] },
      },
    });
  }, 60000);

  afterAll(async () => {
    await server.destroy();
  });

  describe("sequence sharing across channels", () => {
    let newChannelToken: string;

    beforeAll(async () => {
      const [{ zones }, { shippingMethods }, { paymentMethods }, { activeChannel }, { stockLocations }] = await Promise.all([
        adminClient.query(GET_ZONES),
        adminClient.query(GET_SHIPPING_METHODS),
        adminClient.query(GET_PAYMENT_METHODS),
        adminClient.query(GET_ACTIVE_CHANNEL),
        adminClient.query(GET_STOCK_LOCATIONS),
      ]);

      const europeZone = zones.items.find((z: any) => z.name === "Europe");

      const { createChannel } = await adminClient.query(CREATE_CHANNEL, {
        input: {
          code: "seq-sharing-channel",
          token: "seq-sharing-channel-token",
          defaultLanguageCode: "en",
          defaultCurrencyCode: activeChannel.defaultCurrencyCode,
          pricesIncludeTax: false,
          defaultTaxZoneId: europeZone.id,
          defaultShippingZoneId: europeZone.id,
        },
      });

      if (!createChannel.token) {
        throw new Error(`createChannel failed: ${JSON.stringify(createChannel)}`);
      }
      newChannelToken = createChannel.token;

      await adminClient.query(ASSIGN_SHIPPING_METHODS_TO_CHANNEL, {
        input: { channelId: createChannel.id, shippingMethodIds: shippingMethods.items.map((s: any) => s.id) },
      });
      await adminClient.query(ASSIGN_PAYMENT_METHODS_TO_CHANNEL, {
        input: { channelId: createChannel.id, paymentMethodIds: paymentMethods.items.map((p: any) => p.id) },
      });
      await adminClient.query(ASSIGN_PRODUCTS_TO_CHANNEL, {
        input: { channelId: createChannel.id, productIds: ["T_1"] },
      });
      await adminClient.query(ASSIGN_STOCK_LOCATIONS_TO_CHANNEL, {
        input: { channelId: createChannel.id, stockLocationIds: stockLocations.items.map((s: any) => s.id) },
      });
    });

    afterAll(() => {
      shopClient.setChannelToken(null);
    });

    test("invoice sequence on the default channel is incremented when an order is placed on a different channel", async ({ expect }) => {
      const channelService = server.app.get(ChannelService);
      const connection = server.app.get(TransactionalConnection);
      const defaultChannel = await channelService.getDefaultChannel();

      const seqBefore = await connection.rawConnection.getRepository(InvoiceSequence).findOneBy({
        ownerChannelId: defaultChannel.id,
        code: DEFAULT_SEQUENCE_CODE,
      });
      // Should be null because this is the first time for this Channel, the sequences are supposed to self-heal when not existing!
      expect(seqBefore).toBeNull();

      shopClient.setChannelToken(newChannelToken);

      const { product } = await shopClient.query(GET_PRODUCT_WITH_VARIANTS, { id: "T_1" });
      const variantId = product.variants[0].id;

      const { addItemToOrder } = await shopClient.query(ADD_ITEM_TO_ORDER, { productVariantId: variantId, quantity: 1 });
      expect(addItemToOrder.errorCode, `ADD_ITEM_TO_ORDER failed: ${JSON.stringify(addItemToOrder)}`).toBeUndefined();

      await shopClient.query(SET_CUSTOMER_FOR_ORDER, {
        input: { firstName: "Test", lastName: "User", emailAddress: "test@example.com" },
      });
      await shopClient.query(SET_ORDER_SHIPPING_ADDRESS, {
        input: { streetLine1: "Example Street 123", countryCode: "GB" },
      });

      const { eligibleShippingMethods } = await shopClient.query(GET_ELIGIBLE_SHIPPING_METHODS);
      expect(eligibleShippingMethods.length, "No eligible shipping methods found for new channel").toBeGreaterThan(0);

      await shopClient.query(SET_ORDER_SHIPPING_METHOD, {
        shippingMethodId: [eligibleShippingMethods[0].id],
      });

      const { transitionOrderToState } = await shopClient.query(TRANSITION_ORDER_TO_STATE, { state: "ArrangingPayment" });
      expect(transitionOrderToState.state, `TRANSITION_ORDER_TO_STATE failed: ${JSON.stringify(transitionOrderToState)}`).toBe("ArrangingPayment");

      const { addPaymentToOrder } = await shopClient.query(ADD_PAYMENT_TO_ORDER, {
        input: { method: TEST_PAYMENT_METHOD_CODE, metadata: {} },
      });
      expect(addPaymentToOrder.state, `ADD_PAYMENT_TO_ORDER failed: ${JSON.stringify(addPaymentToOrder)}`).toBe("PaymentSettled");

      await awaitRunningJobs(adminClient);
      await assertNoFailedJobs(adminClient);

      const seqAfter = await connection.rawConnection.getRepository(InvoiceSequence).findOneByOrFail({
        ownerChannelId: defaultChannel.id,
        code: DEFAULT_SEQUENCE_CODE,
      });

      expect(seqAfter.sequence).toBe(INITIAL_SEQUENCE_INVOICE + 1);
    });

    test("invoice sequence on the default channel is incremented when an order is placed on the default channel", async ({ expect }) => {
      const channelService = server.app.get(ChannelService);
      const connection = server.app.get(TransactionalConnection);
      const defaultChannel = await channelService.getDefaultChannel();

      shopClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);

      const seqBefore = await connection.rawConnection.getRepository(InvoiceSequence).findOneByOrFail({
        ownerChannelId: defaultChannel.id,
        code: DEFAULT_SEQUENCE_CODE,
      });

      const { product } = await shopClient.query(GET_PRODUCT_WITH_VARIANTS, { id: "T_1" });
      const variantId = product.variants[0].id;

      const { addItemToOrder } = await shopClient.query(ADD_ITEM_TO_ORDER, { productVariantId: variantId, quantity: 1 });
      expect(addItemToOrder.errorCode, `ADD_ITEM_TO_ORDER failed: ${JSON.stringify(addItemToOrder)}`).toBeUndefined();

      await shopClient.query(SET_CUSTOMER_FOR_ORDER, {
        input: { firstName: "Test", lastName: "User", emailAddress: "test@example.com" },
      });
      await shopClient.query(SET_ORDER_SHIPPING_ADDRESS, {
        input: { streetLine1: "Example Street 123", countryCode: "GB" },
      });

      const { eligibleShippingMethods } = await shopClient.query(GET_ELIGIBLE_SHIPPING_METHODS);
      expect(eligibleShippingMethods.length, "No eligible shipping methods found for default channel").toBeGreaterThan(0);

      await shopClient.query(SET_ORDER_SHIPPING_METHOD, {
        shippingMethodId: [eligibleShippingMethods[0].id],
      });

      const { transitionOrderToState } = await shopClient.query(TRANSITION_ORDER_TO_STATE, { state: "ArrangingPayment" });
      expect(transitionOrderToState.state, `TRANSITION_ORDER_TO_STATE failed: ${JSON.stringify(transitionOrderToState)}`).toBe("ArrangingPayment");

      const { addPaymentToOrder } = await shopClient.query(ADD_PAYMENT_TO_ORDER, {
        input: { method: TEST_PAYMENT_METHOD_CODE, metadata: {} },
      });
      expect(addPaymentToOrder.state, `ADD_PAYMENT_TO_ORDER failed: ${JSON.stringify(addPaymentToOrder)}`).toBe("PaymentSettled");

      await awaitRunningJobs(adminClient);
      await assertNoFailedJobs(adminClient);

      const seqAfter = await connection.rawConnection.getRepository(InvoiceSequence).findOneByOrFail({
        ownerChannelId: defaultChannel.id,
        code: DEFAULT_SEQUENCE_CODE,
      });

      expect(seqAfter.sequence).toBe(seqBefore.sequence + 1);
    });
  });

  describe("signed download URLs", () => {
    let invoiceId: string;
    let sequentialId: string;
    let downloadOrigin: string;

    beforeAll(async () => {
      // Relies on the invoices created by the preceding suites, hence `sequential: true`
      const { invoiceList } = await adminClient.query(GET_INVOICE_LIST, { options: { take: 1 } });
      expect(invoiceList.totalItems, "Expected the earlier suites to have created invoices").toBeGreaterThan(0);
      invoiceId = invoiceList.items[0].id;
      sequentialId = invoiceList.items[0].sequentialId;

      const { createInvoiceDownloadUrl } = await adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, { id: invoiceId });
      downloadOrigin = new URL(createInvoiceDownloadUrl).origin;
    });

    /** Mirrors the servers' scheme so that forged and stale links can be crafted here */
    function craftUrl(id: string, expires: number): URL {
      const signature = createHmac("sha256", DOWNLOAD_SIGNING_SECRET)
        .update(`${id}:${expires}`)
        .digest("base64url");

      const url = new URL(`/invoices/${id}/download`, downloadOrigin);
      url.search = new URLSearchParams({ expires: String(expires), signature }).toString();
      return url;
    }

    test("downloads the file without carrying a session", async ({ expect }) => {
      const { createInvoiceDownloadUrl } = await adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, { id: invoiceId });

      const response = await fetch(createInvoiceDownloadUrl);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${sequentialId}.json"`);
      // The DebugFileStrategy writes the snapshot as JSON, so the bytes are assertable
      expect(await response.json()).toMatchObject({ sequentialId });
    });

    test("rejects a tampered signature", async ({ expect }) => {
      const { createInvoiceDownloadUrl } = await adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, { id: invoiceId });

      const url = new URL(createInvoiceDownloadUrl);
      const signature = url.searchParams.get("signature")!;
      url.searchParams.set("signature", `${signature.slice(0, -1)}${signature.at(-1) === "A" ? "B" : "A"}`);

      expect((await fetch(url)).status).toBe(403);
    });

    test("rejects a missing signature", async ({ expect }) => {
      const { createInvoiceDownloadUrl } = await adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, { id: invoiceId });

      const url = new URL(createInvoiceDownloadUrl);
      url.searchParams.delete("signature");

      expect((await fetch(url)).status).toBe(403);
    });

    test("rejects a correctly signed but expired link", async ({ expect }) => {
      const url = craftUrl(invoiceId, Math.floor(Date.now() / 1000) - 1);

      expect((await fetch(url)).status).toBe(410);
    });

    test("honours the requested expiry verbatim, including one in the past", async ({ expect }) => {
      const { createInvoiceDownloadUrl } = await adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, {
        id: invoiceId,
        expiresIn: -60,
      });

      expect((await fetch(createInvoiceDownloadUrl)).status).toBe(410);
    });

    test("returns 404 for a validly signed but unknown invoice", async ({ expect }) => {
      const url = craftUrl("999999", Math.floor(Date.now() / 1000) + 60);

      expect((await fetch(url)).status).toBe(404);
    });

    test("mints a URL that never expires", async ({ expect }) => {
      const { createInvoiceDownloadUrl } = await adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, {
        id: invoiceId,
        neverExpires: true,
      });

      expect(new URL(createInvoiceDownloadUrl).searchParams.get("expires")).toBe("never");
      expect((await fetch(createInvoiceDownloadUrl)).status).toBe(200);
    });

    test("rejects upgrading a finite link into an eternal one", async ({ expect }) => {
      const { createInvoiceDownloadUrl } = await adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, {
        id: invoiceId,
        expiresIn: 60,
      });

      // Keeping the signature but claiming no expiry must not validate
      const url = new URL(createInvoiceDownloadUrl);
      url.searchParams.set("expires", "never");

      expect((await fetch(url)).status).toBe(403);
    });

    test("refuses to combine expiresIn with neverExpires", async ({ expect }) => {
      await expect(
        adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, { id: invoiceId, expiresIn: 60, neverExpires: true }),
      ).rejects.toThrow();
    });

    test("refuses to mint a URL for an unknown invoice", async ({ expect }) => {
      await expect(adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, { id: "999999" })).rejects.toThrow();
    });

    test("refuses to mint a URL for an invoice of a foreign channel", async ({ expect }) => {
      // `assignToCurrentChannel` puts every invoice into its own channel *and* the default
      // one, so the only invoices a sub channel must not reach are the default-only ones.
      const { invoiceList: visibleEverywhere } = await adminClient.query(GET_INVOICE_LIST, { options: { take: 100 } });

      adminClient.setChannelToken("seq-sharing-channel-token");
      try {
        const { invoiceList: visibleInSubChannel } = await adminClient.query(GET_INVOICE_LIST, { options: { take: 100 } });
        const reachable = new Set(visibleInSubChannel.items.map((i: any) => i.id));
        const foreign = visibleEverywhere.items.find((i: any) => !reachable.has(i.id));

        expect(foreign, "Expected an invoice that the sub channel cannot see").toBeDefined();
        await expect(adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, { id: foreign.id })).rejects.toThrow();
      } finally {
        adminClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);
      }
    });
  });
});
