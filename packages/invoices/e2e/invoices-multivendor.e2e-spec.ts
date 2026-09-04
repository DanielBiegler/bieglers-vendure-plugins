import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { LocalAssetStorageStrategy } from "@vendure/asset-server-plugin/lib/src/config/local-asset-storage-strategy";
import { OrderType } from "@vendure/common/lib/generated-types";
import {
  ChannelService,
  EntityHydrator,
  ID,
  idsAreEqual,
  Injector,
  LanguageCode,
  mergeConfig,
  Order,
  OrderLine,
  OrderSellerStrategy,
  PaymentMethodHandler,
  RequestContext,
  RequestContextService,
  SplitOrderContents,
  TransactionalConnection,
} from "@vendure/core";
import { createTestEnvironment, E2E_DEFAULT_CHANNEL_TOKEN } from "@vendure/testing";
import path from "path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertNoFailedJobs, awaitRunningJobs } from "../../../utils/e2e/await-running-jobs";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { DebugSnapshotStrategy } from "../src";
import { PerSellerOrderTargetStrategy } from "../src/config/PerSellerOrderTargetStrategy";
import { DefaultSequenceSelectionStrategy } from "../src/config/SequenceSelectionStrategy";
import { SequentialIdStrategy } from "../src/config/SequentialIdStrategy";
import { FileGenerationResult, FileStrategy } from "../src/config/FileStrategy";
import { InvoiceDocumentContext } from "../src/document-context";
import { Invoice } from "../src/entities/Invoice.entity";
import { InvoiceSequence } from "../src/entities/Sequence.entity";
import { InvoicesPlugin } from "../src/plugin";
import { InvoiceService } from "../src/services/Invoice.service";
import {
  ASSIGN_PAYMENT_METHODS_TO_CHANNEL,
  ASSIGN_PRODUCTS_TO_CHANNEL,
  ASSIGN_SHIPPING_METHODS_TO_CHANNEL,
  ASSIGN_STOCK_LOCATIONS_TO_CHANNEL,
  CREATE_CHANNEL,
  CREATE_INVOICE_DOWNLOAD_URL,
  CREATE_PAYMENT_METHOD,
  GET_ACTIVE_CHANNEL,
  GET_INVOICE_LIST,
  GET_PAYMENT_METHODS,
  GET_SHIPPING_METHODS,
  GET_STOCK_LOCATIONS,
  GET_ZONES,
  ISSUE_INVOICE_DOCUMENTS,
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

/**
 * Whether {@link E2EOrderSellerStrategy.afterSellerOrdersCreated} issues documents.
 *
 * This is the hook a real marketplace would use, and the switch lets the suite also drive
 * the same expansion through the admin mutation instead. Safe as module state because the
 * file runs sequentially.
 */
let issueOnSplit = true;

/** Set by a test to make the FileStrategy throw for one particular vendor prefix. */
let failForPrefix: string | null = null;

/** Vendor channel prefixes, so a document's number says which vendor it belongs to. */
const VENDOR_PREFIXES: Record<string, string> = {};

/**
 * Splits an order by the seller channel of its lines, exactly as the documented
 * multi-vendor pattern does, and then issues one document per vendor.
 */
class E2EOrderSellerStrategy implements OrderSellerStrategy {
  private entityHydrator: EntityHydrator;
  private channelService: ChannelService;
  private injector: Injector;

  init(injector: Injector) {
    this.injector = injector;
    this.entityHydrator = injector.get(EntityHydrator);
    this.channelService = injector.get(ChannelService);
  }

  async setOrderLineSellerChannel(ctx: RequestContext, orderLine: OrderLine) {
    await this.entityHydrator.hydrate(ctx, orderLine.productVariant, { relations: ["channels"] });
    const defaultChannel = await this.channelService.getDefaultChannel();

    // A variant in exactly two channels is in the default channel and its vendor's.
    if (orderLine.productVariant.channels.length === 2)
      return orderLine.productVariant.channels.find(c => !idsAreEqual(c.id, defaultChannel.id));

    return undefined;
  }

  async splitOrder(ctx: RequestContext, order: Order): Promise<SplitOrderContents[]> {
    const groups = new Map<string, SplitOrderContents>();

    for (const line of order.lines) {
      if (line.sellerChannelId == null) continue;
      const key = String(line.sellerChannelId);
      const group = groups.get(key) ?? {
        channelId: line.sellerChannelId,
        state: order.state,
        lines: [],
        shippingLines: [],
      };
      group.lines.push(line);
      groups.set(key, group);
    }

    // Returning [] leaves the order unsplit, which keeps single-vendor fixtures in this
    // same suite behaving as plain orders.
    if (groups.size < 2) return [];

    const split = [...groups.values()];
    split[0].shippingLines = order.shippingLines;
    return split;
  }

  async afterSellerOrdersCreated(ctx: RequestContext, aggregateOrder: Order, _sellerOrders: Order[]) {
    if (!issueOnSplit) return;

    // Runs inside the state transition's transaction, which is what `issueDocuments`
    // requires - and what makes the whole set roll back together if any vendor fails.
    await this.injector.get(InvoiceService).issueDocuments(ctx, { orderId: aggregateOrder.id });
  }
}

/**
 * Names files after the sequential ID, and can be told to blow up for one vendor so the
 * rollback path is testable.
 */
class E2EFileStrategy implements FileStrategy {
  async generate(
    _ctx: RequestContext,
    sequentialId: string,
    snapshot: unknown,
  ): Promise<FileGenerationResult> {
    if (failForPrefix && sequentialId.startsWith(failForPrefix))
      throw new Error(`Deliberate e2e failure for "${sequentialId}"`);

    return {
      files: [{
        filename: `${sequentialId}.json`,
        buffer: Buffer.from(JSON.stringify(snapshot, null, 2)),
        mimeType: "application/json",
      }],
    };
  }
}

/** Prefixes documents by the channel they are issued in, e.g. `ACME-`. */
class VendorPrefixStrategy implements SequentialIdStrategy {
  async generatePrefix(_ctx: RequestContext, doc: InvoiceDocumentContext): Promise<string> {
    return VENDOR_PREFIXES[String(doc.channel.code)] ?? "SHARED-";
  }
}

describe("InvoicesPlugin multi-vendor", { sequential: true }, () => {
  const { server, adminClient, shopClient } = createTestEnvironment(
    mergeConfig(testConfig(8002), {
      paymentOptions: { paymentMethodHandlers: [testPaymentHandler] },
      orderOptions: { orderSellerStrategy: new E2EOrderSellerStrategy() },
      importExportOptions: { importAssetsDir: path.join(__dirname, "fixtures") },
      plugins: [
        AssetServerPlugin.init({ route: "assets", assetUploadDir: path.join(__dirname, "fixtures") }),
        InvoicesPlugin.init({
          prefixStrategy: new VendorPrefixStrategy(),
          fileStrategy: new E2EFileStrategy(),
          snapshotStrategy: new DebugSnapshotStrategy(),
          storageStrategy: new LocalAssetStorageStrategy(path.join(__dirname, "test-invoices-mv")),
          sequenceLeftPadCount: 4,
          documentTargetStrategy: new PerSellerOrderTargetStrategy(),
          // Each vendor needs a range that is gapless in *their* books.
          sequenceSelectionStrategy: new DefaultSequenceSelectionStrategy({ scope: "channel" }),
          download: { signingSecret: "mv-e2e-secret" },
        }),
      ],
    }),
  );

  let vendorA: { id: string; token: string; code: string };
  let vendorB: { id: string; token: string; code: string };
  /** The aggregate order the admin-mutation test issued documents for. */
  let mutationAggregateId: string;

  /** `T_1` is sold by vendor A, `T_2` by vendor B. */
  const PRODUCT_A = "T_1";
  const PRODUCT_B = "T_2";

  beforeAll(async () => {
    await server.init({
      productsCsvPath: path.join(__dirname, "../../../utils/e2e/e2e-products-full.csv"),
      initialData,
      customerCount: 2,
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

    vendorA = await createVendorChannel("vendor-a", PRODUCT_A, "ACME-");
    vendorB = await createVendorChannel("vendor-b", PRODUCT_B, "GLOBEX-");
    // Populating the database from the CSV takes well past the default hook timeout.
  }, 60000);

  afterAll(async () => {
    await server.destroy();
  });

  async function createVendorChannel(code: string, productId: string, prefix: string) {
    const [{ zones }, { shippingMethods }, { paymentMethods }, { activeChannel }, { stockLocations }] =
      await Promise.all([
        adminClient.query(GET_ZONES),
        adminClient.query(GET_SHIPPING_METHODS),
        adminClient.query(GET_PAYMENT_METHODS),
        adminClient.query(GET_ACTIVE_CHANNEL),
        adminClient.query(GET_STOCK_LOCATIONS),
      ]);
    const europeZone = zones.items.find((z: any) => z.name === "Europe");

    const { createChannel } = await adminClient.query(CREATE_CHANNEL, {
      input: {
        code,
        token: `${code}-token`,
        defaultLanguageCode: "en",
        defaultCurrencyCode: activeChannel.defaultCurrencyCode,
        pricesIncludeTax: false,
        defaultTaxZoneId: europeZone.id,
        defaultShippingZoneId: europeZone.id,
      },
    });
    if (!createChannel.token) throw new Error(`createChannel failed: ${JSON.stringify(createChannel)}`);

    await adminClient.query(ASSIGN_SHIPPING_METHODS_TO_CHANNEL, {
      input: { channelId: createChannel.id, shippingMethodIds: shippingMethods.items.map((s: any) => s.id) },
    });
    await adminClient.query(ASSIGN_PAYMENT_METHODS_TO_CHANNEL, {
      input: { channelId: createChannel.id, paymentMethodIds: paymentMethods.items.map((p: any) => p.id) },
    });
    await adminClient.query(ASSIGN_PRODUCTS_TO_CHANNEL, {
      input: { channelId: createChannel.id, productIds: [productId] },
    });
    await adminClient.query(ASSIGN_STOCK_LOCATIONS_TO_CHANNEL, {
      input: { channelId: createChannel.id, stockLocationIds: stockLocations.items.map((s: any) => s.id) },
    });

    VENDOR_PREFIXES[code] = prefix;
    return { id: createChannel.id, token: createChannel.token, code };
  }

  /** Places one order containing a product from each vendor, and returns its code. */
  async function placeSplitOrder(): Promise<string> {
    shopClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);

    for (const productId of [PRODUCT_A, PRODUCT_B]) {
      const { product } = await shopClient.query(GET_PRODUCT_WITH_VARIANTS, { id: productId });
      const { addItemToOrder } = await shopClient.query(ADD_ITEM_TO_ORDER, {
        productVariantId: product.variants[0].id,
        quantity: 1,
      });
      expect(addItemToOrder.errorCode, `ADD_ITEM_TO_ORDER failed: ${JSON.stringify(addItemToOrder)}`).toBeUndefined();
    }

    await shopClient.query(SET_CUSTOMER_FOR_ORDER, {
      input: { firstName: "Test", lastName: "User", emailAddress: "mv@example.com" },
    });
    await shopClient.query(SET_ORDER_SHIPPING_ADDRESS, {
      input: { streetLine1: "Example Street 123", countryCode: "GB" },
    });

    const { eligibleShippingMethods } = await shopClient.query(GET_ELIGIBLE_SHIPPING_METHODS);
    await shopClient.query(SET_ORDER_SHIPPING_METHOD, { shippingMethodId: [eligibleShippingMethods[0].id] });

    const { transitionOrderToState } = await shopClient.query(TRANSITION_ORDER_TO_STATE, { state: "ArrangingPayment" });
    expect(transitionOrderToState.state, JSON.stringify(transitionOrderToState)).toBe("ArrangingPayment");

    const { addPaymentToOrder } = await shopClient.query(ADD_PAYMENT_TO_ORDER, {
      input: { method: TEST_PAYMENT_METHOD_CODE, metadata: {} },
    });
    expect(addPaymentToOrder.errorCode, `ADD_PAYMENT_TO_ORDER failed: ${JSON.stringify(addPaymentToOrder)}`).toBeUndefined();

    await awaitRunningJobs(adminClient);
    await assertNoFailedJobs(adminClient);

    return addPaymentToOrder.code;
  }

  function invoicesOfChannel(token: string) {
    adminClient.setChannelToken(token);
    return adminClient
      .query(GET_INVOICE_LIST, { options: { take: 100 } })
      .finally(() => adminClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN));
  }

  test("issues one separately numbered document per vendor", async ({ expect }) => {
    await placeSplitOrder();

    const connection = server.app.get(TransactionalConnection);
    const invoices = await connection.rawConnection.getRepository(Invoice).find({ relations: ["channels"] });

    expect(invoices).toHaveLength(2);

    const acme = invoices.find(i => i.sequentialId.startsWith("ACME-"));
    const globex = invoices.find(i => i.sequentialId.startsWith("GLOBEX-"));
    expect(acme, "Expected a document numbered in vendor A's range").toBeDefined();
    expect(globex, "Expected a document numbered in vendor B's range").toBeDefined();

    // Each hangs off its own seller order, never the aggregate.
    const orders = await connection.rawConnection.getRepository(Order).find();
    const aggregate = orders.find(o => o.type === OrderType.Aggregate);
    expect(aggregate, "Expected the order to have been split").toBeDefined();

    for (const invoice of invoices) {
      const billed = orders.find(o => String(o.id) === String(invoice.orderId));
      expect(billed?.type).toBe(OrderType.Seller);
      expect(String(billed?.aggregateOrderId)).toBe(String(aggregate!.id));
    }
  });

  test("records which counter each number came from", async ({ expect }) => {
    const connection = server.app.get(TransactionalConnection);
    const invoices = await connection.rawConnection.getRepository(Invoice).find();

    for (const invoice of invoices) {
      expect(invoice.sequenceCode).toBe("__default");
      expect(invoice.sequenceOwnerChannelId).toBeDefined();
    }

    // Two vendors, two distinct owning channels.
    const owners = new Set(invoices.map(i => String(i.sequenceOwnerChannelId)));
    expect(owners.size).toBe(2);
  });

  test("keeps each vendor's range gapless and independent", async ({ expect }) => {
    await placeSplitOrder();

    const connection = server.app.get(TransactionalConnection);
    const invoices = await connection.rawConnection.getRepository(Invoice).find();

    const acme = invoices.filter(i => i.sequentialId.startsWith("ACME-")).map(i => i.sequentialId).sort();
    const globex = invoices.filter(i => i.sequentialId.startsWith("GLOBEX-")).map(i => i.sequentialId).sort();

    // Not interleaved: neither vendor's numbering skips over the other's documents.
    expect(acme).toEqual(["ACME-0001", "ACME-0002"]);
    expect(globex).toEqual(["GLOBEX-0001", "GLOBEX-0002"]);
  });

  test("hides each vendor's documents from the other", async ({ expect }) => {
    const { invoiceList: acmeList } = await invoicesOfChannel(vendorA.token);
    const { invoiceList: globexList } = await invoicesOfChannel(vendorB.token);

    expect(acmeList.items.length).toBeGreaterThan(0);
    expect(globexList.items.length).toBeGreaterThan(0);

    for (const invoice of acmeList.items) expect(invoice.sequentialId).toMatch(/^ACME-/);
    for (const invoice of globexList.items) expect(invoice.sequentialId).toMatch(/^GLOBEX-/);
  });

  test("refuses to mint a download URL for another vendor's document", async ({ expect }) => {
    const { invoiceList } = await invoicesOfChannel(vendorA.token);
    const acmeInvoice = invoiceList.items[0];

    adminClient.setChannelToken(vendorB.token);
    try {
      await expect(
        adminClient.query(CREATE_INVOICE_DOWNLOAD_URL, { id: acmeInvoice.id }),
      ).rejects.toThrow();
    } finally {
      adminClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);
    }
  });

  test("issues the whole set through the admin mutation", async ({ expect }) => {
    issueOnSplit = false;
    try {
      const orderCode = await placeSplitOrder();

      const connection = server.app.get(TransactionalConnection);
      const aggregate = await connection.rawConnection
        .getRepository(Order)
        .findOneByOrFail({ code: orderCode });

      const before = await connection.rawConnection.getRepository(Invoice).count();

      mutationAggregateId = String(aggregate.id);

      const { issueInvoiceDocuments } = await adminClient.query(ISSUE_INVOICE_DOCUMENTS, {
        input: { orderId: mutationAggregateId },
      });

      expect(issueInvoiceDocuments.documents).toHaveLength(2);
      const channelCodes = issueInvoiceDocuments.documents.map((d: any) => d.channel.code).sort();
      expect(channelCodes).toEqual(["vendor-a", "vendor-b"]);

      const after = await connection.rawConnection.getRepository(Invoice).count();
      expect(after).toBe(before + 2);
    } finally {
      issueOnSplit = true;
    }
  });

  test("skipIfAlreadyIssued does not double-issue", async ({ expect }) => {
    const connection = server.app.get(TransactionalConnection);
    const before = await connection.rawConnection.getRepository(Invoice).count();

    // The very order the previous test already issued documents for.
    const { issueInvoiceDocuments } = await adminClient.query(ISSUE_INVOICE_DOCUMENTS, {
      input: { orderId: mutationAggregateId, skipIfAlreadyIssued: true },
    });

    expect(issueInvoiceDocuments.documents).toHaveLength(0);
    expect(await connection.rawConnection.getRepository(Invoice).count()).toBe(before);
  });

  test("rolls the whole set back when one vendor's document fails", async ({ expect }) => {
    const connection = server.app.get(TransactionalConnection);

    const invoicesBefore = await connection.rawConnection.getRepository(Invoice).count();
    const sequencesBefore = await connection.rawConnection.getRepository(InvoiceSequence).find();
    const before = new Map(sequencesBefore.map(s => [String(s.ownerChannelId), s.sequence]));

    // The second vendor blows up, by which point the first has already written its file.
    failForPrefix = "GLOBEX-";
    try {
      await placeSplitOrder();
    } catch {
      // The failure surfaces on the checkout transition, which is the point.
    } finally {
      failForPrefix = null;
    }

    expect(
      await connection.rawConnection.getRepository(Invoice).count(),
      "A partially failed set must leave no documents behind",
    ).toBe(invoicesBefore);

    const sequencesAfter = await connection.rawConnection.getRepository(InvoiceSequence).find();
    for (const row of sequencesAfter)
      expect(
        row.sequence,
        `Sequence for channel ${row.ownerChannelId} moved despite the rollback`,
      ).toBe(before.get(String(row.ownerChannelId)));
  });

  test("issueDocuments refuses to run outside a transaction", async ({ expect }) => {
    const invoiceService = server.app.get(InvoiceService);
    const ctx = await server.app.get(RequestContextService).create({ apiType: "admin" });

    await expect(
      invoiceService.issueDocuments(ctx, { orderId: "T_1" }),
    ).rejects.toThrow(/must run inside a transaction/);
  });
});
