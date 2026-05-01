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
import { createTestEnvironment } from "@vendure/testing";
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
import { Invoice } from "../src/entities/Invoice.entity";
import { InvoiceSequence } from "../src/entities/Sequence.entity";
import { InvoicesPlugin } from "../src/plugin";
import { CREATE_PAYMENT_METHOD } from "./graphql/admin-e2e-definitions";
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

describe("InvoicesPlugin", { concurrent: true }, () => {

  const INITIAL_SEQUENCE_INVOICE = 1336;
  const INITIAL_SEQUENCE_CREDITNOTE = 68;
  const INVOICE_PREFIX = "INVOICE";
  const CREDITNOTE_PREFIX = "CREDIT";

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

  // TODO multi vendor test with perChannelConfig, probably own file
  // then this e2e should test sequence sharing over channels

  test("creates an invoice when an order is placed", async ({ expect }) => {
    const channelService = server.app.get(ChannelService);
    const connection = server.app.get(TransactionalConnection);
    const defaultChannel = await channelService.getDefaultChannel();

    const configBefore = await connection.rawConnection.getRepository(InvoiceSequence).findOneBy({
      ownerChannelId: defaultChannel.id,
      code: DEFAULT_SEQUENCE_CODE_INVOICE,
    });
    // Should be null because this is the first time for this Channel, the sequences
    // are supposed to self-heal when not existing!
    expect(configBefore).toBeNull();

    const { product } = await shopClient.query(GET_PRODUCT_WITH_VARIANTS, { id: "T_1" });
    const variantId = product.variants[0].id;

    await shopClient.query(ADD_ITEM_TO_ORDER, { productVariantId: variantId, quantity: 1 });
    await shopClient.query(SET_CUSTOMER_FOR_ORDER, {
      input: { firstName: "Test", lastName: "User", emailAddress: "test@example.com" },
    });
    await shopClient.query(SET_ORDER_SHIPPING_ADDRESS, {
      input: { streetLine1: "Example Street 123", countryCode: "GB" },
    });

    const { eligibleShippingMethods } = await shopClient.query(GET_ELIGIBLE_SHIPPING_METHODS);
    await shopClient.query(SET_ORDER_SHIPPING_METHOD, {
      shippingMethodId: [eligibleShippingMethods[0].id],
    });

    await shopClient.query(TRANSITION_ORDER_TO_STATE, { state: "ArrangingPayment" });
    const { addPaymentToOrder } = await shopClient.query(ADD_PAYMENT_TO_ORDER, {
      input: { method: TEST_PAYMENT_METHOD_CODE, metadata: {} },
    });
    expect(addPaymentToOrder.state).toBe("PaymentSettled");

    await awaitRunningJobs(adminClient);
    await assertNoFailedJobs(adminClient);

    const invoices = await connection.rawConnection.getRepository(Invoice).find();
    expect(invoices).toHaveLength(1);
    expect(invoices[0].sequentialId).toBe(`${INVOICE_PREFIX}${INITIAL_SEQUENCE_INVOICE}`);

    console.log("-----", await connection.rawConnection.getRepository(InvoiceSequence).find())
    const configAfter = await connection.rawConnection.getRepository(InvoiceSequence).findOneByOrFail({
      ownerChannelId: defaultChannel.id,
      code: DEFAULT_SEQUENCE_CODE_INVOICE,
    });
    expect(configAfter?.sequence).toBe(INITIAL_SEQUENCE_INVOICE + 1);
  });
});
