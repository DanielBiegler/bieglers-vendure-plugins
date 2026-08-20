import { INestApplicationContext } from "@nestjs/common";
import {
  Customer,
  CustomerService,
  ID,
  Logger,
  manualFulfillmentHandler,
  OrderService,
  PaymentMethodService,
  ProductVariantService,
  RequestContext,
  TransactionalConnection,
} from "@vendure/core";

const loggerCtx = "DevSeed";

export interface SeedOrdersOptions {
  /** How many orders to create in total. */
  count: number;
  /** Code of the PaymentMethod to pay with. Defaults to the first enabled method. */
  paymentMethodCode?: string;
  /**
   * Fractions of the generated orders, applied in order of increasing progress. The remainder
   * is left in `PaymentSettled`. They must sum to <= 1.
   */
  distribution?: {
    /** Never completed, so they show up as active carts. */
    activeCart?: number;
    /** Stops at `ArrangingPayment`, i.e. checkout started but no payment taken. */
    arrangingPayment?: number;
    /** Fully fulfilled and marked as delivered. */
    delivered?: number;
    /** Fulfilled and marked as shipped. */
    shipped?: number;
  };
}

const defaultDistribution = {
  activeCart: 0.1,
  arrangingPayment: 0.1,
  delivered: 0.3,
  shipped: 0.2,
} satisfies SeedOrdersOptions["distribution"];

/**
 * Deterministic PRNG (mulberry32) so that repeated seeding runs with the same seed produce
 * byte-identical orders, which is what makes an invoice or a snapshot worth diffing.
 */
function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeededOrderSummary {
  created: number;
  byState: Record<string, number>;
}

export async function seedOrders(
  app: INestApplicationContext,
  ctx: RequestContext,
  randomSeed: number,
  options: SeedOrdersOptions,
): Promise<SeededOrderSummary> {
  const orderService = app.get(OrderService);
  const customerService = app.get(CustomerService);
  const productVariantService = app.get(ProductVariantService);
  const paymentMethodService = app.get(PaymentMethodService);
  const connection = app.get(TransactionalConnection);

  const random = createRandom(randomSeed);
  const summary: SeededOrderSummary = { created: 0, byState: {} };

  const { items: customers } = await customerService.findAll(ctx, { take: 500 }, ["addresses", "addresses.country"]);
  if (customers.length === 0) {
    Logger.warn("No customers found - skipping order seeding", loggerCtx);
    return summary;
  }

  const { items: allVariants } = await productVariantService.findAll(ctx, { take: 1000 });
  const variants = allVariants.filter((v) => v.enabled);
  if (variants.length === 0) {
    Logger.warn("No purchasable ProductVariants found - skipping order seeding", loggerCtx);
    return summary;
  }

  const { items: paymentMethods } = await paymentMethodService.findAll(ctx, { filter: { enabled: { eq: true } } });
  const paymentMethod = options.paymentMethodCode
    ? paymentMethods.find((m) => m.code === options.paymentMethodCode)
    : paymentMethods[0];
  if (!paymentMethod) {
    Logger.warn(
      `No enabled PaymentMethod${options.paymentMethodCode ? ` with code "${options.paymentMethodCode}"` : ""} found - skipping order seeding`,
      loggerCtx,
    );
    return summary;
  }

  const dist = { ...defaultDistribution, ...options.distribution };
  const plan = buildPlan(options.count, dist);

  for (let i = 0; i < options.count; i++) {
    const customer = customers[Math.floor(random() * customers.length)];
    const target = plan[i];
    try {
      // `OrderService.addPaymentToOrder` refuses to run outside a transaction, and keeping the
      // whole order in one means a half-built order is never left behind on failure.
      const state = await connection.withTransaction(ctx, txCtx =>
        seedSingleOrder({
          orderService,
          ctx: txCtx,
          customer,
          variants,
          paymentMethodCode: paymentMethod.code,
          random,
          target,
        }),
      );
      summary.created++;
      summary.byState[state] = (summary.byState[state] ?? 0) + 1;
    } catch (e: any) {
      Logger.warn(`Could not seed order ${i + 1}/${options.count}: ${e.message as string}`, loggerCtx);
    }
  }

  return summary;
}

type OrderTarget = "activeCart" | "arrangingPayment" | "paymentSettled" | "shipped" | "delivered";

/**
 * Spreads the targets evenly across the run instead of creating them in blocks, so that any
 * `take: n` listing in the dashboard shows a mix of states.
 */
function buildPlan(count: number, dist: Required<NonNullable<SeedOrdersOptions["distribution"]>>): OrderTarget[] {
  const counts: Array<[OrderTarget, number]> = [
    ["activeCart", Math.round(count * dist.activeCart)],
    ["arrangingPayment", Math.round(count * dist.arrangingPayment)],
    ["shipped", Math.round(count * dist.shipped)],
    ["delivered", Math.round(count * dist.delivered)],
  ];
  const pool: OrderTarget[] = counts.flatMap(([target, n]) => Array<OrderTarget>(Math.max(0, n)).fill(target));
  while (pool.length < count) pool.push("paymentSettled");
  pool.length = count;

  const plan: OrderTarget[] = [];
  const buckets = new Map<OrderTarget, number>();
  for (const target of pool) buckets.set(target, (buckets.get(target) ?? 0) + 1);
  while (plan.length < count) {
    for (const [target, remaining] of buckets) {
      if (remaining > 0 && plan.length < count) {
        plan.push(target);
        buckets.set(target, remaining - 1);
      }
    }
  }
  return plan;
}

async function seedSingleOrder(args: {
  orderService: OrderService;
  ctx: RequestContext;
  customer: Customer;
  variants: Array<{ id: ID }>;
  paymentMethodCode: string;
  random: () => number;
  target: OrderTarget;
}): Promise<string> {
  const { orderService, ctx, customer, variants, paymentMethodCode, random, target } = args;

  const created = await orderService.create(ctx);
  await orderService.addCustomerToOrder(ctx, created.id, customer);
  const orderId = created.id;

  const lineCount = 1 + Math.floor(random() * 3);
  const picked = new Set<ID>();
  let linesAdded = 0;
  for (let i = 0; i < lineCount; i++) {
    const variant = variants[Math.floor(random() * variants.length)];
    if (picked.has(variant.id)) continue;
    picked.add(variant.id);
    const quantity = 1 + Math.floor(random() * 3);
    const result = await orderService.addItemToOrder(ctx, orderId, variant.id, quantity);
    // Out-of-stock variants are expected (the sample catalogue ships some with stockOnHand 0),
    // so a rejected line is skipped rather than failing the whole order.
    if (!isErrorResult(result)) linesAdded++;
  }
  if (linesAdded === 0) throw new Error("no order lines could be added");

  if (target === "activeCart") return "AddingItems";

  const address = customer.addresses?.[0];
  if (!address) throw new Error(`customer ${customer.emailAddress} has no address`);
  const addressInput = {
    fullName: address.fullName,
    streetLine1: address.streetLine1,
    streetLine2: address.streetLine2,
    city: address.city,
    province: address.province,
    postalCode: address.postalCode,
    countryCode: address.country.code,
    phoneNumber: address.phoneNumber,
  };
  await orderService.setShippingAddress(ctx, orderId, addressInput);
  await orderService.setBillingAddress(ctx, orderId, addressInput);

  const quotes = await orderService.getEligibleShippingMethods(ctx, orderId);
  if (quotes.length === 0) throw new Error("no eligible shipping methods");
  const quote = quotes[Math.floor(random() * quotes.length)];
  assertSuccess(await orderService.setShippingMethod(ctx, orderId, [quote.id]));

  assertSuccess(await orderService.transitionToState(ctx, orderId, "ArrangingPayment"));
  if (target === "arrangingPayment") return "ArrangingPayment";

  const paid = assertSuccess(
    await orderService.addPaymentToOrder(ctx, orderId, { method: paymentMethodCode, metadata: {} }),
  );
  if (target === "paymentSettled") return paid.state;

  const withLines = await orderService.findOne(ctx, orderId, ["lines"]);
  if (!withLines) throw new Error("order vanished after payment");

  const fulfillment = assertSuccess(
    await orderService.createFulfillment(ctx, {
      lines: withLines.lines.map((line) => ({ orderLineId: line.id, quantity: line.quantity })),
      handler: {
        code: manualFulfillmentHandler.code,
        arguments: [
          { name: "method", value: "Dev seed fulfillment" },
          { name: "trackingCode", value: `DEV-${String(orderId)}` },
        ],
      },
    }),
  );
  assertSuccess(await orderService.transitionFulfillmentToState(ctx, fulfillment.id, "Shipped"));
  if (target === "shipped") return "Shipped";

  assertSuccess(await orderService.transitionFulfillmentToState(ctx, fulfillment.id, "Delivered"));
  return "Delivered";
}

function isErrorResult(input: any): input is { errorCode: string; message: string } {
  return typeof input === "object" && input != null && typeof input.errorCode === "string";
}

function assertSuccess<T>(input: T): Exclude<T, { errorCode: string }> {
  if (isErrorResult(input)) throw new Error(`${input.errorCode}: ${input.message}`);
  return input as Exclude<T, { errorCode: string }>;
}
