// Deliberately the sibling's sources rather than the published package: the e2e run must
// exercise the plugin as it is in this repo, not whatever `dist` happens to hold.
import { InvoicesPlugin } from "../../invoices/src/plugin";
import { StaticSequentialIdStrategy } from "../../invoices/src/config/SequentialIdStrategy";
import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { LocalAssetStorageStrategy } from "@vendure/asset-server-plugin/lib/src/config/local-asset-storage-strategy";
import { LanguageCode, PaymentMethodHandler } from "@vendure/core";
import { createTestEnvironment } from "@vendure/testing";
import { readFileSync, rmSync } from "node:fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertNoFailedJobs, awaitRunningJobs } from "../../../utils/e2e/await-running-jobs";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { CREATE_PAYMENT_METHOD, GET_INVOICE_LIST } from "../../invoices/e2e/graphql/admin-e2e-definitions";
import {
  ADD_ITEM_TO_ORDER,
  ADD_PAYMENT_TO_ORDER,
  GET_ELIGIBLE_SHIPPING_METHODS,
  SET_CUSTOMER_FOR_ORDER,
  SET_ORDER_SHIPPING_ADDRESS,
  SET_ORDER_SHIPPING_METHOD,
  TRANSITION_ORDER_TO_STATE,
} from "../../invoices/e2e/graphql/shop-e2e-definitions";
import { GET_ORDERS_WITH_TOTALS, GET_PRODUCT_WITH_VARIANT_NAMES } from "./graphql/definitions";
import { createFormatter } from "../src/format";
import { MerchantDetails } from "../src/types";
import { PdfkitFileStrategy } from "../src/PdfkitFileStrategy";
import { PdfkitSnapshotStrategy } from "../src/PdfkitSnapshotStrategy";
import { extractText, squash } from "../test/pdf-text";
import { AutoIssueInvoicesPlugin } from "../../../utils/auto-issue-invoices.plugin";

const TEST_PAYMENT_METHOD_CODE = "test-payment-method";
const INVOICE_PREFIX = "PDFKIT-INVOICE";
const INVOICE_DIR = path.join(__dirname, "generated-invoices");

const MERCHANT: MerchantDetails = {
  name: "Musterhandel GmbH",
  address: { streetLine1: "Beispielstraße 12", postalCode: "50667", city: "Köln" },
  vatId: "DE123456789",
};

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

describe("PdfkitInvoiceStrategy", { sequential: true }, () => {
  const { server, adminClient, shopClient } = createTestEnvironment({
    ...testConfig(8002),
    paymentOptions: { paymentMethodHandlers: [testPaymentHandler] },
    importExportOptions: { importAssetsDir: path.join(__dirname, "fixtures") },
    plugins: [
      AssetServerPlugin.init({ route: "assets", assetUploadDir: path.join(__dirname, "fixtures") }),
      AutoIssueInvoicesPlugin,
      InvoicesPlugin.init({
        prefixStrategy: new StaticSequentialIdStrategy(INVOICE_PREFIX),
        storageStrategy: new LocalAssetStorageStrategy(INVOICE_DIR),
        snapshotStrategy: new PdfkitSnapshotStrategy({
          merchant: MERCHANT,
          locale: "en-GB",
          texts: { intro: "Thank you for your order." },
        }),
        // Uncompressed streams are what make the rendered text assertable below.
        fileStrategy: new PdfkitFileStrategy({ compress: false }),
        initialSequence: 2000,
        sequenceLeftPadCount: 4,
        download: { signingSecret: "e2e-download-signing-secret" },
      }),
    ],
  });

  beforeAll(async () => {
    rmSync(INVOICE_DIR, { recursive: true, force: true });

    await server.init({
      productsCsvPath: path.join(__dirname, "../../../utils/e2e/e2e-products-full.csv"),
      initialData,
      customerCount: 1,
      logging: false,
    });
    await adminClient.asSuperAdmin();

    await adminClient.query(CREATE_PAYMENT_METHOD, {
      input: {
        code: TEST_PAYMENT_METHOD_CODE,
        enabled: true,
        translations: [{ languageCode: "en", name: "Test Payment Method", description: "" }],
        handler: { code: TEST_PAYMENT_METHOD_CODE, arguments: [] },
      },
    });
  }, 120000);

  afterAll(async () => {
    await server.destroy();
  });

  let variantName: string;
  let orderCode: string;
  let orderTotalWithTax: number;
  let currencyCode: string;
  let pdfText: string;

  test("placing an order renders a PDF invoice", async () => {
    const { product } = await shopClient.query(GET_PRODUCT_WITH_VARIANT_NAMES, { id: "T_1" });
    variantName = product.variants[0].name;

    const { addItemToOrder } = await shopClient.query(ADD_ITEM_TO_ORDER, {
      productVariantId: product.variants[0].id,
      quantity: 2,
    });
    expect(addItemToOrder.errorCode, JSON.stringify(addItemToOrder)).toBeUndefined();

    // Non-Latin-1 throughout, so the assertions below prove the characters survive the whole
    // trip: GraphQL, the database, the JSON snapshot and finally the embedded font subset.
    await shopClient.query(SET_CUSTOMER_FOR_ORDER, {
      input: { firstName: "Тест", lastName: "Тестенко", emailAddress: "test@example.com" },
    });
    await shopClient.query(SET_ORDER_SHIPPING_ADDRESS, {
      input: { fullName: "Тест Тестенко", streetLine1: "Musterstraße 3", city: "Köln", postalCode: "50667", countryCode: "GB" },
    });

    const { eligibleShippingMethods } = await shopClient.query(GET_ELIGIBLE_SHIPPING_METHODS);
    await shopClient.query(SET_ORDER_SHIPPING_METHOD, { shippingMethodId: [eligibleShippingMethods[0].id] });

    const { transitionOrderToState } = await shopClient.query(TRANSITION_ORDER_TO_STATE, { state: "ArrangingPayment" });
    expect(transitionOrderToState.state, JSON.stringify(transitionOrderToState)).toBe("ArrangingPayment");

    const { addPaymentToOrder } = await shopClient.query(ADD_PAYMENT_TO_ORDER, {
      input: { method: TEST_PAYMENT_METHOD_CODE, metadata: {} },
    });
    expect(addPaymentToOrder.state, JSON.stringify(addPaymentToOrder)).toBe("PaymentSettled");

    await awaitRunningJobs(adminClient);
    await assertNoFailedJobs(adminClient);

    const { invoiceList } = await adminClient.query(GET_INVOICE_LIST, {});
    expect(invoiceList.totalItems).toBe(1);

    const { orders } = await adminClient.query(GET_ORDERS_WITH_TOTALS);
    orderCode = orders.items[0].code;
    orderTotalWithTax = orders.items[0].totalWithTax;
    currencyCode = orders.items[0].currencyCode;

    const pdf = readFileSync(path.join(INVOICE_DIR, `${invoiceList.items[0].sequentialId}.pdf`));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

    pdfText = extractText(pdf);
    expect(pdfText).toContain(invoiceList.items[0].sequentialId);
  });

  test("the rendered invoice carries the order's own data", () => {
    // Squashed because a value that wraps inside its column loses the space it broke on.
    const text = squash(pdfText);

    expect(text).toContain(orderCode);
    expect(text).toContain(squash("Тест Тестенко"));
    expect(text).toContain(squash("Musterstraße 3"));
    expect(text).toContain(squash(variantName));
    expect(text).toContain(squash(MERCHANT.name));
    expect(text).toContain(MERCHANT.vatId!);
    expect(text).toContain(MERCHANT.address!.city!);
  });

  test("the printed grand total matches the order total", () => {
    const fmt = createFormatter({ locale: "en-GB", currencyCode, precision: 2, priceDisplay: "net" });
    const total = fmt.money(orderTotalWithTax).replace(/[^\d.,]/g, "");

    expect(squash(pdfText)).toContain(total);
  });
});
