import type { Invoice, SnapshotStrategy } from "@danielbiegler/vendure-plugin-invoices";
import {
  AdjustmentType,
  ConfigService,
  EntityHydrator,
  Injector,
  Order,
  OrderLine,
  RequestContext,
} from "@vendure/core";

/** `@vendure/core` re-exports the entities but not this generated address shape. */
type OrderAddress = Order["billingAddress"];
import { InvoiceLabels, labelsForLocale } from "./labels";
import {
  CustomerDetails,
  InvoiceAddress,
  InvoiceTexts,
  MerchantDetails,
  PDFKIT_SNAPSHOT_VERSION,
  PdfkitDocumentKind,
  PdfkitSnapshot,
  PdfkitSnapshotAdjustment,
  PdfkitSnapshotLine,
  PdfkitSnapshotPage,
  Resolvable,
} from "./types";

export interface LineDescription {
  name: string;
  sku?: string;
  /** Printed underneath the name, e.g. option values, a serial number or a delivery date. */
  details?: string[];
}

export interface PdfkitSnapshotStrategyOptions {
  /**
   * The issuing party. Vendure has no home for a seller's postal address or VAT ID,
   * so it has to be supplied here. Pass a function to derive it from the Order's
   * Seller/Channel in a multi-vendor setup.
   */
  merchant: Resolvable<MerchantDetails>;

  /**
   * BCP 47 tag deciding number/date formatting and which built-in label set is used.
   *
   * @default the RequestContext's language code
   */
  locale?: Resolvable<string>;

  /** Overrides merged over the built-in labels for the resolved locale. */
  labels?: Resolvable<Partial<InvoiceLabels>>;

  texts?: Resolvable<InvoiceTexts>;

  /** Page geometry and PDF metadata. Merged over {@link DEFAULT_PAGE}. */
  page?: Resolvable<Partial<PdfkitSnapshotPage>>;

  /**
   * Whether the item table prints net or gross prices. The totals block always shows
   * both sides of the tax, only the emphasis changes.
   *
   * @default "net"
   */
  priceDisplay?: "net" | "gross";

  dateOptions?: Intl.DateTimeFormatOptions;

  /** Printed as the customer number, typically a custom field. */
  customerNumber?: (ctx: RequestContext, order: Order) => string | undefined | Promise<string | undefined>;

  /** The customer's VAT ID for reverse charge invoices, typically a custom field. */
  customerVatId?: (ctx: RequestContext, order: Order) => string | undefined | Promise<string | undefined>;

  /** Overrides how an OrderLine is described in the item table. */
  describeLine?: (
    ctx: RequestContext,
    line: OrderLine,
    order: Order,
  ) => LineDescription | Promise<LineDescription>;

  /**
   * Credit notes mirror the invoice they cancel with negated amounts, which is what
   * German "Stornorechnungen" and most bookkeeping imports expect. Set to `false` to
   * print positive amounts under a credit note heading instead.
   *
   * @default true
   */
  negateCreditNoteAmounts?: boolean;
}

export const DEFAULT_PAGE: PdfkitSnapshotPage = {
  size: "A4",
  layout: "portrait",
  // The generous bottom margin is not whitespace: the page footer is drawn into it.
  margins: { top: 56, bottom: 104, left: 56, right: 56 },
};

/**
 * Turns an {@link Order} into the self-contained record that {@link PdfkitFileStrategy}
 * renders. Everything that could change later — prices, product names, the shop's own
 * address, even the wording of the labels — is copied in here at issue time.
 */
export class PdfkitSnapshotStrategy implements SnapshotStrategy<PdfkitSnapshot> {
  private entityHydrator!: EntityHydrator;
  private moneyPrecision = 2;

  constructor(private options: PdfkitSnapshotStrategyOptions) {}

  init(injector: Injector) {
    this.entityHydrator = injector.get(EntityHydrator);
    this.moneyPrecision = injector.get(ConfigService).entityOptions.moneyStrategy.precision ?? 2;
  }

  async generate(
    ctx: RequestContext,
    sequentialId: string,
    order: Order,
    cancels?: Invoice | null,
  ): Promise<PdfkitSnapshot> {
    // The plugin loads an Order with default relations, which omits the shipping
    // method names and payments this document needs.
    await this.entityHydrator.hydrate(ctx, order, {
      relations: ["customer", "lines.productVariant", "shippingLines.shippingMethod", "surcharges", "payments"],
    });

    const kind: PdfkitDocumentKind = cancels ? "credit-note" : "invoice";
    const sign = kind === "credit-note" && this.options.negateCreditNoteAmounts !== false ? -1 : 1;
    const money = (value: number) => sign * Math.round(value);

    const locale = normalizeLocale(await resolve(this.options.locale ?? ctx.languageCode, ctx, order));
    const labels: InvoiceLabels = {
      ...labelsForLocale(locale),
      ...(await resolve(this.options.labels ?? {}, ctx, order)),
    };
    const merchant = await resolve(this.options.merchant, ctx, order);
    const page = { ...DEFAULT_PAGE, ...(await resolve(this.options.page ?? {}, ctx, order)) };

    const lines = await this.buildLines(ctx, order, money);
    const discounts = buildOrderLevelDiscounts(order, money);
    const surcharges = (order.surcharges ?? []).map((surcharge) => ({
      description: surcharge.description,
      sku: surcharge.sku || undefined,
      price: money(surcharge.price),
      priceWithTax: money(surcharge.priceWithTax),
      taxRate: surcharge.taxRate,
    }));
    const shipping = (order.shippingLines ?? []).map((line) => ({
      description: line.shippingMethod?.name ?? "",
      price: money(line.discountedPrice),
      priceWithTax: money(line.discountedPriceWithTax),
      taxRate: line.taxRate,
    }));
    const payments = (order.payments ?? []).map((payment) => ({
      method: payment.method,
      amount: money(payment.amount),
      state: payment.state,
      date: payment.createdAt?.toISOString(),
      transactionId: payment.transactionId || undefined,
    }));

    const paid = (order.payments ?? [])
      .filter((payment) => payment.state === "Settled")
      .reduce((total, payment) => total + payment.amount, 0);

    return {
      version: PDFKIT_SNAPSHOT_VERSION,
      document: {
        kind,
        sequentialId,
        issuedAt: new Date().toISOString(),
        cancels: cancels
          ? { sequentialId: cancels.sequentialId, issuedAt: cancels.createdAt?.toISOString() }
          : undefined,
      },
      order: {
        code: order.code,
        placedAt: order.orderPlacedAt?.toISOString(),
        state: order.state,
        customerId:
          (await this.options.customerNumber?.(ctx, order)) ?? order.customer?.id?.toString(),
      },
      format: {
        locale,
        currencyCode: order.currencyCode,
        precision: this.moneyPrecision,
        dateOptions: this.options.dateOptions,
        priceDisplay: this.options.priceDisplay ?? "net",
      },
      merchant,
      customer: await this.buildCustomer(ctx, order),
      lines,
      discounts,
      surcharges,
      shipping,
      taxes: order.taxSummary.map((tax) => ({
        description: tax.description,
        taxRate: tax.taxRate,
        taxBase: money(tax.taxBase),
        taxTotal: money(tax.taxTotal),
      })),
      totals: {
        items: sumBy(lines, (line) => line.lineTotal),
        itemsWithTax: sumBy(lines, (line) => line.lineTotalWithTax),
        discounts: sumBy(discounts, (discount) => discount.amount),
        discountsWithTax: sumBy(discounts, (discount) => discount.amountWithTax),
        surcharges: sumBy(surcharges, (surcharge) => surcharge.price),
        surchargesWithTax: sumBy(surcharges, (surcharge) => surcharge.priceWithTax),
        shipping: money(order.shipping),
        shippingWithTax: money(order.shippingWithTax),
        subTotal: money(order.subTotal),
        subTotalWithTax: money(order.subTotalWithTax),
        tax: money(order.totalWithTax - order.total),
        total: money(order.total),
        totalWithTax: money(order.totalWithTax),
        paid: money(paid),
        outstanding: money(order.totalWithTax - paid),
      },
      payments,
      texts: await resolve(this.options.texts ?? {}, ctx, order),
      labels,
      page,
    };
  }

  private async buildLines(
    ctx: RequestContext,
    order: Order,
    money: (value: number) => number,
  ): Promise<PdfkitSnapshotLine[]> {
    const lines: PdfkitSnapshotLine[] = [];

    for (const [index, line] of (order.lines ?? []).entries()) {
      const description = this.options.describeLine
        ? await this.options.describeLine(ctx, line, order)
        : { name: line.productVariant?.name ?? "", sku: line.productVariant?.sku };

      lines.push({
        position: index + 1,
        name: description.name,
        sku: description.sku || undefined,
        details: description.details?.length ? description.details : undefined,
        quantity: line.quantity,
        listUnitPrice: money(line.unitPrice),
        listUnitPriceWithTax: money(line.unitPriceWithTax),
        unitPrice: money(line.discountedUnitPrice),
        unitPriceWithTax: money(line.discountedUnitPriceWithTax),
        lineTotal: money(line.discountedLinePrice),
        lineTotalWithTax: money(line.discountedLinePriceWithTax),
        taxRate: line.taxRate,
        // Order level promotions are reported once for the whole order further down,
        // so only the discounts already priced into this line are listed here.
        discounts: line.discounts
          .filter((discount) => discount.type === AdjustmentType.PROMOTION)
          .map((discount) => ({
            description: discount.description,
            amount: money(discount.amount),
            amountWithTax: money(discount.amountWithTax),
          })),
      });
    }

    return lines;
  }

  private async buildCustomer(ctx: RequestContext, order: Order): Promise<CustomerDetails> {
    // Shop API checkouts may only ever set a shipping address, in which case it is
    // also the address the invoice is made out to.
    const billing = hasAddress(order.billingAddress) ? order.billingAddress : order.shippingAddress;
    const shipping = hasAddress(order.shippingAddress) ? order.shippingAddress : undefined;

    const name =
      billing?.fullName?.trim() ||
      [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ");

    return {
      name,
      billingAddress: toInvoiceAddress(billing),
      shippingAddress:
        shipping && !addressesMatch(billing, shipping) ? toInvoiceAddress(shipping) : undefined,
      email: order.customer?.emailAddress,
      phoneNumber: billing?.phoneNumber ?? order.customer?.phoneNumber ?? undefined,
      vatId: await this.options.customerVatId?.(ctx, order),
    };
  }
}

/**
 * Discounts of promotions that apply to the order as a whole are distributed across the
 * lines by Vendure, so they are neither in a line's `discountedUnitPrice` nor visible as
 * a single amount. Regrouping them by promotion restores the row a reader expects.
 */
function buildOrderLevelDiscounts(order: Order, money: (value: number) => number): PdfkitSnapshotAdjustment[] {
  const grouped = new Map<string, PdfkitSnapshotAdjustment>();

  for (const line of order.lines ?? []) {
    for (const discount of line.discounts) {
      if (discount.type !== AdjustmentType.DISTRIBUTED_ORDER_PROMOTION) continue;

      const existing = grouped.get(discount.adjustmentSource);
      if (existing) {
        existing.amount += money(discount.amount);
        existing.amountWithTax += money(discount.amountWithTax);
      } else {
        grouped.set(discount.adjustmentSource, {
          description: discount.description,
          amount: money(discount.amount),
          amountWithTax: money(discount.amountWithTax),
        });
      }
    }
  }

  return [...grouped.values()];
}

async function resolve<T>(resolvable: Resolvable<T>, ctx: RequestContext, order: Order): Promise<T> {
  if (typeof resolvable === "function") {
    return (resolvable as (ctx: RequestContext, order: Order) => T | Promise<T>)(ctx, order);
  }
  return resolvable;
}

function sumBy<T>(items: T[], select: (item: T) => number): number {
  return items.reduce((total, item) => total + select(item), 0);
}

function hasAddress(address?: OrderAddress): boolean {
  return !!address && !!(address.streetLine1 || address.city || address.postalCode);
}

function toInvoiceAddress(address?: OrderAddress | null): InvoiceAddress {
  return {
    company: address?.company ?? undefined,
    fullName: address?.fullName ?? undefined,
    streetLine1: address?.streetLine1 ?? undefined,
    streetLine2: address?.streetLine2 ?? undefined,
    postalCode: address?.postalCode ?? undefined,
    city: address?.city ?? undefined,
    province: address?.province ?? undefined,
    country: address?.country ?? undefined,
    countryCode: address?.countryCode ?? undefined,
  };
}

function addressesMatch(a?: OrderAddress, b?: OrderAddress): boolean {
  const key = (address?: OrderAddress) =>
    [address?.fullName, address?.company, address?.streetLine1, address?.streetLine2, address?.postalCode, address?.city, address?.countryCode]
      .map((part) => (part ?? "").trim().toLowerCase())
      .join("|");

  return key(a) === key(b);
}

/** Vendure language codes use underscores (`pt_BR`), Intl wants hyphens. */
function normalizeLocale(locale: string): string {
  return locale.replace(/_/g, "-");
}
