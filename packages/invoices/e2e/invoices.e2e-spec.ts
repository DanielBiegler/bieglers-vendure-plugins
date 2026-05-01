import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { LocalAssetStorageStrategy } from "@vendure/asset-server-plugin/lib/src/config/local-asset-storage-strategy";
import {
  AssetStorageStrategy,
  ChannelService,
  ID,
  LanguageCode,
  PaymentMethodHandler,
  RequestContext,
  TransactionalConnection
} from "@vendure/core";
import { createTestEnvironment, E2E_DEFAULT_CHANNEL_TOKEN } from "@vendure/testing";
import path from "path";
import { Stream } from "stream";
import { afterAll, beforeAll, describe, test } from "vitest";
import { assertNoFailedJobs, awaitRunningJobs } from "../../../utils/e2e/await-running-jobs";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { DEFAULT_SEQUENCE_CODE_INVOICE } from "../src";
import { DebugFileGenerationStrategy } from "../src/config/DebugFileGenerationStrategy";
import { InvoiceFileGenerationResult, InvoiceFileGenerationStrategy } from "../src/config/InvoiceFileGenerationStrategy";
import { StaticSequentialIdPrefixGenerationStrategy } from "../src/config/StaticSequentialIdPrefixGenerationStrategy";
import { InvoiceSequence } from "../src/entities/Sequence.entity";
import { InvoicesPlugin } from "../src/plugin";
import {
  ASSIGN_PAYMENT_METHODS_TO_CHANNEL,
  ASSIGN_PRODUCTS_TO_CHANNEL,
  ASSIGN_SHIPPING_METHODS_TO_CHANNEL,
  ASSIGN_STOCK_LOCATIONS_TO_CHANNEL,
  CREATE_CHANNEL,
  CREATE_PAYMENT_METHOD,
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

class TestPdfGenerationStrategy implements InvoiceFileGenerationStrategy {
  generate(_ctx: RequestContext, _invoiceNumber: string, _orderId: ID): Promise<InvoiceFileGenerationResult> {
    return Promise.resolve({ filename: "testfile", buffer: Buffer.from("testfile") });
  }
}

class TestStorageStrategy implements AssetStorageStrategy {
  writeFileFromBuffer(fileName: string, _data: Buffer): Promise<string> {
    return Promise.resolve(`https://cdn.test/${fileName}`);
  }
  writeFileFromStream(fileName: string, _data: Stream): Promise<string> {
    return Promise.resolve(`https://cdn.test/${fileName}`);
  }
  readFileToBuffer(_identifier: string): Promise<Buffer> {
    return Promise.resolve(Buffer.alloc(0));
  }
  readFileToStream(_identifier: string): Promise<Stream> {
    throw new Error("Not needed in tests");
  }
  deleteFile(_identifier: string): Promise<void> {
    return Promise.resolve();
  }
  fileExists(_fileName: string): Promise<boolean> {
    return Promise.resolve(false);
  }
}

describe("InvoicesPlugin", { sequential: true }, () => {

  const INITIAL_SEQUENCE_INVOICE = 1337;
  const INITIAL_SEQUENCE_CREDITNOTE = 69;
  const INVOICE_PREFIX = "SINGLE-VENDOR-INVOICE";
  const CREDITNOTE_PREFIX = "SINGLE-VENDOR-CREDIT";

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
        invoiceIdPrefixGenerationStrategy: new StaticSequentialIdPrefixGenerationStrategy(INVOICE_PREFIX),
        creditNoteIdPrefixGenerationStrategy: new StaticSequentialIdPrefixGenerationStrategy(CREDITNOTE_PREFIX),
        invoiceFileGenerationStrategy: new DebugFileGenerationStrategy(),
        creditNoteFileGenerationStrategy: new DebugFileGenerationStrategy(),
        storageStrategy: new LocalAssetStorageStrategy(path.join(__dirname, "test-invoices")),
        invoiceSequenceLeftPadCount: 4,
        creditNoteSequenceLeftPadCount: 4,
        subscribeToOrderPlacedEvent: true,
        initialInvoiceSequence: INITIAL_SEQUENCE_INVOICE,
        initialCreditNoteSequence: INITIAL_SEQUENCE_CREDITNOTE,

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
        code: DEFAULT_SEQUENCE_CODE_INVOICE,
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
        code: DEFAULT_SEQUENCE_CODE_INVOICE,
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
        code: DEFAULT_SEQUENCE_CODE_INVOICE,
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
        code: DEFAULT_SEQUENCE_CODE_INVOICE,
      });

      expect(seqAfter.sequence).toBe(seqBefore.sequence + 1);
    });
  });
});
