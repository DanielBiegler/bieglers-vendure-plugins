import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { LocalAssetStorageStrategy } from "@vendure/asset-server-plugin/lib/src/config/local-asset-storage-strategy";
import {
  ChannelService,
  ConfigService,
  LanguageCode,
  PaymentMethodHandler,
  RequestContext,
  TransactionalConnection
} from "@vendure/core";
import { createTestEnvironment, E2E_DEFAULT_CHANNEL_TOKEN } from "@vendure/testing";
import { createHmac } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertNoFailedJobs, awaitRunningJobs } from "../../../utils/e2e/await-running-jobs";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { DebugSnapshotStrategy, DEFAULT_SEQUENCE_CODE, PLUGIN_INVOICE_CREATED } from "../src";
import { DebugFileStrategy } from "../src/config/FileStrategy";
import { StaticSequentialIdStrategy } from "../src/config/SequentialIdStrategy";
import { InvoiceSequence } from "../src/entities/Sequence.entity";
import { InvoicesPlugin } from "../src/plugin";
import { InvoiceExportService } from "../src/services/InvoiceExport.service";
import {
  ASSIGN_PAYMENT_METHODS_TO_CHANNEL,
  ASSIGN_PRODUCTS_TO_CHANNEL,
  ASSIGN_SHIPPING_METHODS_TO_CHANNEL,
  ASSIGN_STOCK_LOCATIONS_TO_CHANNEL,
  CREATE_CHANNEL,
  CREATE_INVOICE_DOWNLOAD_URL,
  CREATE_INVOICE_EXPORT,
  CREATE_INVOICE_EXPORT_DOWNLOAD_URL,
  CREATE_PAYMENT_METHOD,
  DELETE_INVOICE_EXPORT,
  GET_ACTIVE_CHANNEL,
  GET_INVOICE_EXPORT,
  GET_INVOICE_LIST,
  GET_ORDER_HISTORY,
  GET_ORDERS,
  GET_PAYMENT_METHODS,
  GET_SHIPPING_METHODS,
  GET_STOCK_LOCATIONS,
  GET_ZONES,
  INVOICE_EXPORT_PREVIEW_COUNT,
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

  describe("order history", () => {
    test("records an entry for every issued invoice", async ({ expect }) => {
      const { orders } = await adminClient.query(GET_ORDERS);
      expect(orders.items.length, "Expected the earlier suites to have placed orders").toBeGreaterThan(0);

      const { invoiceList } = await adminClient.query(GET_INVOICE_LIST, { options: { take: 100 } });
      const invoicesByOrder = new Map<string, any>();
      for (const order of orders.items) {
        const { order: withHistory } = await adminClient.query(GET_ORDER_HISTORY, { id: order.id });
        const entries = withHistory.history.items.filter((i: any) => i.type === PLUGIN_INVOICE_CREATED);
        expect(entries.length, `Order ${order.code} has no invoice history entry`).toBe(1);
        invoicesByOrder.set(order.id, entries[0]);

        // Internal accounting identifiers have no business in the Shop API
        expect(entries[0].isPublic).toBe(false);
        expect(entries[0].data.cancelsSequentialId).toBeUndefined();
      }

      // Every entry points at an invoice that actually exists
      const knownSequentialIds = new Set(invoiceList.items.map((i: any) => i.sequentialId));
      for (const entry of invoicesByOrder.values()) {
        expect(knownSequentialIds).toContain(entry.data.sequentialId);
        expect(entry.data.invoiceId).toBeDefined();
      }
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

    /**
     * Mirrors the servers' scheme so that forged and stale links can be crafted here.
     * The `invoice:` prefix is the domain separator, see {@link DOWNLOAD_KIND_INVOICE}.
     */
    function craftUrl(id: string, expires: number): URL {
      const signature = createHmac("sha256", DOWNLOAD_SIGNING_SECRET)
        .update(`invoice:${id}:${expires}`)
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

  describe("bulk export by date range", () => {
    /** Reads a zip from a buffer without touching disk. */
    async function readZipEntries(buffer: Buffer): Promise<Map<string, Buffer>> {
      const { fromBuffer } = await import("yauzl");
      return new Promise((resolve, reject) => {
        fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
          if (err || !zip) return reject(err);
          const entries = new Map<string, Buffer>();
          zip.on("entry", entry => {
            zip.openReadStream(entry, (streamErr, stream) => {
              if (streamErr || !stream) return reject(streamErr);
              const chunks: Buffer[] = [];
              stream.on("data", (chunk: Buffer) => chunks.push(chunk));
              stream.on("end", () => {
                entries.set(entry.fileName, Buffer.concat(chunks));
                zip.readEntry();
              });
            });
          });
          zip.on("end", () => resolve(entries));
          zip.on("error", reject);
          zip.readEntry();
        });
      });
    }

    /** Polls until the export job leaves its non-terminal states. */
    async function runExport(startsAt: string, endsAt: string) {
      const { createInvoiceExport } = await adminClient.query(CREATE_INVOICE_EXPORT, {
        input: { startsAt, endsAt },
      });
      await awaitRunningJobs(adminClient);
      await assertNoFailedJobs(adminClient);

      const { invoiceExport } = await adminClient.query(GET_INVOICE_EXPORT, { id: createInvoiceExport.id });
      return invoiceExport;
    }

    /** A range wide enough to cover every invoice the earlier suites created. */
    const WHOLE_PERIOD = {
      startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    test("counts the invoices a range would export", async ({ expect }) => {
      const { invoiceExportPreviewCount } = await adminClient.query(INVOICE_EXPORT_PREVIEW_COUNT, WHOLE_PERIOD);
      const { invoiceList } = await adminClient.query(GET_INVOICE_LIST, { options: { take: 100 } });

      expect(invoiceExportPreviewCount).toBe(invoiceList.totalItems);
    });

    test("archives every invoice of the range, keyed by sequential ID", async ({ expect }) => {
      const record = await runExport(WHOLE_PERIOD.startsAt, WHOLE_PERIOD.endsAt);

      expect(record.state).toBe("COMPLETED");
      expect(record.missingFileCount).toBe(0);
      expect(record.filename).toMatch(/\.zip$/);
      expect(record.fileSizeBytes).toBeGreaterThan(0);

      const { createInvoiceExportDownloadUrl } = await adminClient.query(CREATE_INVOICE_EXPORT_DOWNLOAD_URL, {
        id: record.id,
      });
      const response = await fetch(createInvoiceExportDownloadUrl);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/zip");
      expect(response.headers.get("content-length")).toBe(String(record.fileSizeBytes));

      const entries = await readZipEntries(Buffer.from(await response.arrayBuffer()));
      expect(entries.size).toBe(record.entryCount);

      const { invoiceList } = await adminClient.query(GET_INVOICE_LIST, { options: { take: 100 } });
      const names = [...entries.keys()];
      for (const invoice of invoiceList.items) {
        expect(names.some(name => name.endsWith(`/${invoice.sequentialId}.json`))).toBe(true);
      }

      // The DebugFileStrategy writes the snapshot as JSON, so the bytes are assertable
      const [first] = invoiceList.items;
      const stored = names.find(name => name.endsWith(`/${first.sequentialId}.json`))!;
      expect(JSON.parse(entries.get(stored)!.toString())).toMatchObject({ sequentialId: first.sequentialId });
    });

    test("produces a valid, empty archive for a range without invoices", async ({ expect }) => {
      const record = await runExport("1999-01-01T00:00:00.000Z", "1999-02-01T00:00:00.000Z");

      expect(record.state).toBe("COMPLETED");
      expect(record.entryCount).toBe(0);

      const { createInvoiceExportDownloadUrl } = await adminClient.query(CREATE_INVOICE_EXPORT_DOWNLOAD_URL, {
        id: record.id,
      });
      const response = await fetch(createInvoiceExportDownloadUrl);

      expect(response.status).toBe(200);
      expect((await readZipEntries(Buffer.from(await response.arrayBuffer()))).size).toBe(0);
    });

    test("treats the upper bound as exclusive", async ({ expect }) => {
      const { invoiceList } = await adminClient.query(GET_INVOICE_LIST, { options: { take: 1 } });
      // Floored to the second because sqlite stores `createdAt` at that resolution, so
      // the value coming back over the API can sit above what the column actually holds.
      const boundary = new Date(
        Math.floor(new Date(invoiceList.items[0].createdAt).getTime() / 1000) * 1000,
      ).toISOString();

      // The newest invoice sits exactly on the boundary, so an exclusive end must drop it
      const { invoiceExportPreviewCount: excluded } = await adminClient.query(INVOICE_EXPORT_PREVIEW_COUNT, {
        startsAt: boundary,
        endsAt: boundary,
      });
      const { invoiceExportPreviewCount: included } = await adminClient.query(INVOICE_EXPORT_PREVIEW_COUNT, {
        startsAt: boundary,
        endsAt: new Date(new Date(boundary).getTime() + 1000).toISOString(),
      });

      expect(excluded).toBe(0);
      expect(included).toBeGreaterThan(0);
    });

    test("rejects a range that ends before it starts", async ({ expect }) => {
      await expect(
        adminClient.query(CREATE_INVOICE_EXPORT, {
          input: { startsAt: WHOLE_PERIOD.endsAt, endsAt: WHOLE_PERIOD.startsAt },
        }),
      ).rejects.toThrow();
    });

    test("returns the in-flight record instead of queueing a duplicate", async ({ expect }) => {
      const first = await adminClient.query(CREATE_INVOICE_EXPORT, { input: WHOLE_PERIOD });
      const second = await adminClient.query(CREATE_INVOICE_EXPORT, { input: WHOLE_PERIOD });

      // Only holds while the first is still queued, which is the case before jobs run
      expect(second.createInvoiceExport.id).toBe(first.createInvoiceExport.id);
      await awaitRunningJobs(adminClient);
    });

    describe("signed archive URLs", () => {
      let record: any;
      let origin: string;

      beforeAll(async () => {
        record = await runExport(WHOLE_PERIOD.startsAt, WHOLE_PERIOD.endsAt);
        const { createInvoiceExportDownloadUrl } = await adminClient.query(CREATE_INVOICE_EXPORT_DOWNLOAD_URL, {
          id: record.id,
        });
        origin = new URL(createInvoiceExportDownloadUrl).origin;
      });

      test("rejects an invoice signature replayed against the export route", async ({ expect }) => {
        // Without domain separation in the HMAC payload these would be interchangeable
        // whenever an invoice and an export happen to share a numeric ID.
        const expires = Math.floor(Date.now() / 1000) + 60;
        const signature = createHmac("sha256", DOWNLOAD_SIGNING_SECRET)
          .update(`invoice:${record.id}:${expires}`)
          .digest("base64url");

        const url = new URL(`/invoices/exports/${record.id}/download`, origin);
        url.search = new URLSearchParams({ expires: String(expires), signature }).toString();

        expect((await fetch(url)).status).toBe(403);
      });

      test("rejects an export signature replayed against the invoice route", async ({ expect }) => {
        const expires = Math.floor(Date.now() / 1000) + 60;
        const signature = createHmac("sha256", DOWNLOAD_SIGNING_SECRET)
          .update(`export:${record.id}:${expires}`)
          .digest("base64url");

        const url = new URL(`/invoices/${record.id}/download`, origin);
        url.search = new URLSearchParams({ expires: String(expires), signature }).toString();

        expect((await fetch(url)).status).toBe(403);
      });

      test("binds the signature to a single export", async ({ expect }) => {
        const other = await runExport("1998-01-01T00:00:00.000Z", "1998-02-01T00:00:00.000Z");
        const { createInvoiceExportDownloadUrl } = await adminClient.query(CREATE_INVOICE_EXPORT_DOWNLOAD_URL, {
          id: record.id,
        });

        // Repointing a valid link at a different export must not validate
        const url = new URL(createInvoiceExportDownloadUrl);
        url.pathname = `/invoices/exports/${other.id}/download`;
        expect((await fetch(url)).status).toBe(403);
      });

      test("rejects a correctly signed but expired link", async ({ expect }) => {
        const { createInvoiceExportDownloadUrl } = await adminClient.query(CREATE_INVOICE_EXPORT_DOWNLOAD_URL, {
          id: record.id,
          expiresIn: -60,
        });

        expect((await fetch(createInvoiceExportDownloadUrl)).status).toBe(410);
      });

      test("refuses to mint a URL for an unknown export", async ({ expect }) => {
        await expect(
          adminClient.query(CREATE_INVOICE_EXPORT_DOWNLOAD_URL, { id: "999999" }),
        ).rejects.toThrow();
      });
    });

    test("keeps exports of other channels out of reach", async ({ expect }) => {
      const mine = await runExport(WHOLE_PERIOD.startsAt, WHOLE_PERIOD.endsAt);

      adminClient.setChannelToken("seq-sharing-channel-token");
      try {
        const { invoiceExport } = await adminClient.query(GET_INVOICE_EXPORT, { id: mine.id });
        expect(invoiceExport).toBeNull();

        await expect(
          adminClient.query(CREATE_INVOICE_EXPORT_DOWNLOAD_URL, { id: mine.id }),
        ).rejects.toThrow();
      } finally {
        adminClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);
      }
    });

    test("only archives invoices of the requesting channel", async ({ expect }) => {
      adminClient.setChannelToken("seq-sharing-channel-token");
      try {
        const { invoiceList } = await adminClient.query(GET_INVOICE_LIST, { options: { take: 100 } });
        const record = await runExport(WHOLE_PERIOD.startsAt, WHOLE_PERIOD.endsAt);

        expect(record.state).toBe("COMPLETED");
        expect(record.entryCount).toBe(invoiceList.totalItems);

        const { createInvoiceExportDownloadUrl } = await adminClient.query(CREATE_INVOICE_EXPORT_DOWNLOAD_URL, {
          id: record.id,
        });
        const entries = await readZipEntries(
          Buffer.from(await (await fetch(createInvoiceExportDownloadUrl)).arrayBuffer()),
        );

        const reachable = new Set(invoiceList.items.map((i: any) => `${i.sequentialId}.json`));
        for (const name of entries.keys()) {
          expect(reachable).toContain(name.split("/").pop());
        }
      } finally {
        adminClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);
      }
    });

    test("deletes an export and its archives", async ({ expect }) => {
      const record = await runExport(WHOLE_PERIOD.startsAt, WHOLE_PERIOD.endsAt);

      const { deleteInvoiceExport } = await adminClient.query(DELETE_INVOICE_EXPORT, { id: record.id });
      expect(deleteInvoiceExport.result).toBe("DELETED");

      const { invoiceExport } = await adminClient.query(GET_INVOICE_EXPORT, { id: record.id });
      expect(invoiceExport).toBeNull();
    });

    /**
     * Regression cover for a crash. `AssetStorageStrategy` offers no way to ask whether a
     * file exists, and the local strategy hands back an `fs.ReadStream` whose ENOENT lands
     * as an `error` event a tick after its promise already resolved. Nothing was listening,
     * so one swept file took the whole server down instead of producing a 404.
     *
     * Runs last on purpose: it deletes files that the earlier suites download.
     */
    describe("files that vanished from storage", () => {
      const uploadPath = path.join(__dirname, "test-invoices");
      let orphan: { id: string; sequentialId: string; assetUrl: string };
      let intact: { id: string; sequentialId: string; assetUrl: string };

      beforeAll(async () => {
        const { invoiceList } = await adminClient.query(GET_INVOICE_LIST, { options: { take: 100 } });
        orphan = invoiceList.items.at(-1);
        intact = invoiceList.items[0];
        expect(orphan.id).not.toBe(intact.id);

        await rm(path.join(uploadPath, orphan.assetUrl));
      });

      test("answers 404 for an invoice whose file is gone", async ({ expect }) => {
        const { createInvoiceDownloadUrl } = await adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, {
          id: orphan.id,
        });

        expect((await fetch(createInvoiceDownloadUrl)).status).toBe(404);
      });

      test("keeps serving other invoices, i.e. the process survived", async ({ expect }) => {
        const { createInvoiceDownloadUrl } = await adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, {
          id: intact.id,
        });
        const response = await fetch(createInvoiceDownloadUrl);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ sequentialId: intact.sequentialId });
      });

      test("counts a missing file rather than failing the whole export", async ({ expect }) => {
        const { invoiceList } = await adminClient.query(GET_INVOICE_LIST, { options: { take: 100 } });
        const record = await runExport(WHOLE_PERIOD.startsAt, WHOLE_PERIOD.endsAt);

        expect(record.state).toBe("COMPLETED");
        expect(record.missingFileCount).toBe(1);
        expect(record.entryCount).toBe(invoiceList.totalItems - 1);

        const { createInvoiceExportDownloadUrl } = await adminClient.query(CREATE_INVOICE_EXPORT_DOWNLOAD_URL, {
          id: record.id,
        });
        const entries = await readZipEntries(
          Buffer.from(await (await fetch(createInvoiceExportDownloadUrl)).arrayBuffer()),
        );

        expect(entries.size).toBe(record.entryCount);
        expect([...entries.keys()].some(name => name.endsWith(`/${orphan.sequentialId}.json`))).toBe(false);
      });

      test("answers 404 when the archive itself is gone", async ({ expect }) => {
        const record = await runExport(WHOLE_PERIOD.startsAt, WHOLE_PERIOD.endsAt);
        expect(record.state).toBe("COMPLETED");

        await rm(path.join(uploadPath, record.filename));

        const { createInvoiceExportDownloadUrl } = await adminClient.query(CREATE_INVOICE_EXPORT_DOWNLOAD_URL, {
          id: record.id,
        });

        expect((await fetch(createInvoiceExportDownloadUrl)).status).toBe(404);

        // Again the real assertion: a dead server cannot answer this.
        const { invoiceExportPreviewCount } = await adminClient.query(INVOICE_EXPORT_PREVIEW_COUNT, WHOLE_PERIOD);
        expect(invoiceExportPreviewCount).toBeGreaterThan(0);
      });
    });

    /**
     * `maxAge` is in **seconds**. Pruning with 300 has to sweep a ten minute old export and
     * pruning with 3600 has to leave it alone — under the days reading this once had, both
     * numbers would be centuries and neither would delete anything.
     *
     * Runs last: the sweep is deliberately not channel-scoped, so it takes every export the
     * earlier tests left behind with it.
     */
    describe("retention sweep", () => {
      test("treats maxAge as seconds", async ({ expect }) => {
        const service = server.app.get(InvoiceExportService);
        const connection = server.app.get(TransactionalConnection);
        const ctx = RequestContext.empty();

        const record = await runExport(WHOLE_PERIOD.startsAt, WHOLE_PERIOD.endsAt);
        expect(record.state).toBe("COMPLETED");

        // The GraphQL ID is opaque (the test config hands out "T_11"), so it has to go back
        // through the configured strategy before it means anything to a raw query.
        const dbId = server.app.get(ConfigService).entityOptions.entityIdStrategy?.decodeId(record.id);

        // Raw SQL rather than the query builder: TypeORM silently drops `@CreateDateColumn`
        // from an UPDATE, so a backdate through `.set({ createdAt })` does nothing at all.
        await connection.rawConnection.query(
          `UPDATE invoice_export SET createdAt = ? WHERE id = ?`,
          [new Date(Date.now() - 10 * 60 * 1000).toISOString().slice(0, 19).replace("T", " "), dbId],
        );

        expect(await service.pruneExpired(ctx, 60 * 60)).toBe(0);
        expect((await adminClient.query(GET_INVOICE_EXPORT, { id: record.id })).invoiceExport).not.toBeNull();

        expect(await service.pruneExpired(ctx, 5 * 60)).toBeGreaterThanOrEqual(1);
        expect((await adminClient.query(GET_INVOICE_EXPORT, { id: record.id })).invoiceExport).toBeNull();
      });
    });
  });
});
