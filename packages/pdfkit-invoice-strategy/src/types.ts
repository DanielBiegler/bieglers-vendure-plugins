import type { Order, RequestContext } from "@vendure/core";
import type { InvoiceLabels } from "./labels";

/**
 * Anything the document needs can either be a fixed value or derived from the
 * {@link Order}. Multi-vendor shops need the latter, because merchant details,
 * language and legal texts differ per Seller while the plugin is configured once.
 */
export type Resolvable<T> = T | ((ctx: RequestContext, order: Order) => T | Promise<T>);

/**
 * Monetary amount in the minor units of {@link PdfkitSnapshotFormat.currencyCode},
 * exactly as Vendure stores it. Never pre-divide these; the renderer applies the
 * precision of the configured `MoneyStrategy`.
 */
export type Money = number;

/**
 * Bumped whenever the snapshot shape changes in a way that a renderer needs to know
 * about. Snapshots are immutable records that outlive the code that wrote them, so
 * the version travels with the data instead of being inferred from the package version.
 */
export const PDFKIT_SNAPSHOT_VERSION = 1;

export type PdfkitDocumentKind = "invoice" | "credit-note";

/**
 * The complete, JSON serializable record of an invoice. Everything the PDF shows is
 * in here, which is what makes a re-render years later reproduce the original
 * document even after products, prices or the shop's address have changed.
 */
export interface PdfkitSnapshot {
  version: number;
  document: PdfkitSnapshotDocument;
  order: PdfkitSnapshotOrder;
  format: PdfkitSnapshotFormat;
  merchant: MerchantDetails;
  customer: CustomerDetails;
  lines: PdfkitSnapshotLine[];
  /** Order level discounts, i.e. those not already contained in a line's `unitPrice`. */
  discounts: PdfkitSnapshotAdjustment[];
  surcharges: PdfkitSnapshotSurcharge[];
  shipping: PdfkitSnapshotShippingLine[];
  taxes: PdfkitSnapshotTaxRow[];
  totals: PdfkitSnapshotTotals;
  payments: PdfkitSnapshotPayment[];
  texts: InvoiceTexts;
  labels: InvoiceLabels;
  page: PdfkitSnapshotPage;
}

export interface PdfkitSnapshotDocument {
  kind: PdfkitDocumentKind;
  sequentialId: string;
  /** ISO 8601. The moment the document was issued, which is not necessarily when the order was placed. */
  issuedAt: string;
  /** Set on credit notes: the invoice this document cancels. */
  cancels?: {
    sequentialId: string;
    issuedAt?: string;
  };
}

export interface PdfkitSnapshotOrder {
  code: string;
  /** ISO 8601, absent while the order is still a draft. */
  placedAt?: string;
  state: string;
  /** Shown as the customer number when available. */
  customerId?: string;
}

export interface PdfkitSnapshotFormat {
  /** BCP 47 tag driving every formatted number and date in the document. */
  locale: string;
  currencyCode: string;
  /** Decimal places of the configured `MoneyStrategy`; 2 for the Vendure default. */
  precision: number;
  /** Passed straight to `Intl.DateTimeFormat`. */
  dateOptions?: Intl.DateTimeFormatOptions;
  /** Whether the item table prints net or gross unit prices. Totals always show both. */
  priceDisplay: "net" | "gross";
}

export interface InvoiceAddress {
  company?: string;
  fullName?: string;
  streetLine1?: string;
  streetLine2?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  country?: string;
  countryCode?: string;
}

/**
 * The issuing party. None of it lives in Vendure by default, so it has to come from
 * the strategy options, either statically or resolved per Order for multi-vendor shops.
 */
export interface MerchantDetails {
  name: string;
  address: InvoiceAddress;
  email?: string;
  phoneNumber?: string;
  website?: string;
  /** VAT identification number, e.g. `DE123456789`. */
  vatId?: string;
  /** Domestic tax number, where it differs from the VAT ID. */
  taxNumber?: string;
  /** Commercial register entry, e.g. `HRB 12345, Amtsgericht Köln`. */
  registrationNumber?: string;
  /**
   * Small print repeated at the bottom of every page, e.g. bank details or
   * managing directors. Rendered as evenly spaced columns.
   */
  footerColumns?: Array<{ heading?: string; lines: string[] }>;
}

export interface CustomerDetails {
  name: string;
  billingAddress: InvoiceAddress;
  /** Only carried when it differs from the billing address. */
  shippingAddress?: InvoiceAddress;
  email?: string;
  phoneNumber?: string;
  vatId?: string;
}

export interface PdfkitSnapshotLine {
  /** 1-based, as printed in the leftmost column. */
  position: number;
  name: string;
  sku?: string;
  /** Extra lines printed below the name, e.g. option values or a serial number. */
  details?: string[];
  quantity: number;
  /** Undiscounted, for showing what the discount was granted from. */
  listUnitPrice: Money;
  listUnitPriceWithTax: Money;
  /** Includes line level discounts, excludes order level ones. */
  unitPrice: Money;
  unitPriceWithTax: Money;
  lineTotal: Money;
  lineTotalWithTax: Money;
  /** Percentage, e.g. `19` for 19%. */
  taxRate: number;
  /** Line level discounts, already reflected in `unitPrice`. Listed for transparency. */
  discounts: PdfkitSnapshotAdjustment[];
}

export interface PdfkitSnapshotAdjustment {
  description: string;
  /** Negative for discounts. */
  amount: Money;
  amountWithTax: Money;
}

export interface PdfkitSnapshotSurcharge {
  description: string;
  sku?: string;
  price: Money;
  priceWithTax: Money;
  taxRate: number;
}

export interface PdfkitSnapshotShippingLine {
  description: string;
  price: Money;
  priceWithTax: Money;
  taxRate: number;
}

export interface PdfkitSnapshotTaxRow {
  description: string;
  /** Percentage, e.g. `19` for 19%. */
  taxRate: number;
  taxBase: Money;
  taxTotal: Money;
}

export interface PdfkitSnapshotTotals {
  /** Sum of the printed line totals, before order level discounts. */
  items: Money;
  itemsWithTax: Money;
  discounts: Money;
  discountsWithTax: Money;
  surcharges: Money;
  surchargesWithTax: Money;
  shipping: Money;
  shippingWithTax: Money;
  /** `Order.subTotal`, i.e. lines and surcharges after all discounts. */
  subTotal: Money;
  subTotalWithTax: Money;
  tax: Money;
  /** Net grand total, `Order.total`. */
  total: Money;
  /** Gross grand total, `Order.totalWithTax`. This is the amount that is owed. */
  totalWithTax: Money;
  /** Sum of settled payments. */
  paid: Money;
  /** `totalWithTax - paid`. Zero for a fully paid order. */
  outstanding: Money;
}

export interface PdfkitSnapshotPayment {
  method: string;
  amount: Money;
  state: string;
  /** ISO 8601 */
  date?: string;
  transactionId?: string;
}

export interface InvoiceTexts {
  /** Between the address block and the item table, e.g. "thank you for your order". */
  intro?: string;
  /** Below the totals, e.g. payment terms or a reverse charge notice. */
  outro?: string;
}

/** The JSON safe subset of `PDFKit.PDFDocumentOptions` that affects the page geometry. */
export interface PdfkitSnapshotPage {
  /** A named size such as `A4` or explicit `[width, height]` points. */
  size?: string | [number, number];
  layout?: "portrait" | "landscape";
  margins: { top: number; bottom: number; left: number; right: number };
  /** BCP 47 tag written into the PDF for screen readers. */
  lang?: string;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}
