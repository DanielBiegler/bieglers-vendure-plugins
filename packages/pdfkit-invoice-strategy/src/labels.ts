/**
 * Every user facing string of the document. The whole set is copied into the snapshot,
 * so wording changes never retroactively alter documents that were already issued.
 *
 * Strings in curly braces are placeholders filled in by {@link interpolate}.
 */
export interface InvoiceLabels {
  // Titles
  invoice: string;
  creditNote: string;

  // Meta block
  invoiceNumber: string;
  creditNoteNumber: string;
  documentDate: string;
  orderCode: string;
  orderDate: string;
  customerNumber: string;
  /** `{sequentialId}` */
  cancelsInvoice: string;

  // Parties
  billTo: string;
  shipTo: string;
  vatId: string;
  taxNumber: string;
  registrationNumber: string;
  email: string;
  phone: string;
  website: string;

  // Item table
  position: string;
  description: string;
  sku: string;
  quantity: string;
  unitPriceNet: string;
  unitPriceGross: string;
  taxRate: string;
  lineTotalNet: string;
  lineTotalGross: string;

  // Summary
  itemsTotal: string;
  discount: string;
  surcharge: string;
  shipping: string;
  netTotal: string;
  /** Added on top of the net total. `{rate}` and `{description}` */
  taxAtRate: string;
  /** Already contained in a gross total. `{rate}` and `{description}` */
  taxIncludedAtRate: string;
  taxTotal: string;
  grandTotal: string;
  paid: string;
  outstanding: string;

  // Footer
  /** `{page}` and `{pages}` */
  page: string;
}

const en: InvoiceLabels = {
  invoice: "Invoice",
  creditNote: "Credit note",

  invoiceNumber: "Invoice no.",
  creditNoteNumber: "Credit note no.",
  documentDate: "Date",
  orderCode: "Order",
  orderDate: "Order date",
  customerNumber: "Customer no.",
  cancelsInvoice: "Cancels invoice {sequentialId}",

  billTo: "Bill to",
  shipTo: "Ship to",
  vatId: "VAT ID",
  taxNumber: "Tax no.",
  registrationNumber: "Register",
  email: "Email",
  phone: "Phone",
  website: "Web",

  position: "#",
  description: "Description",
  sku: "SKU",
  quantity: "Qty",
  unitPriceNet: "Unit price (net)",
  unitPriceGross: "Unit price (gross)",
  taxRate: "VAT",
  lineTotalNet: "Total (net)",
  lineTotalGross: "Total (gross)",

  itemsTotal: "Items",
  discount: "Discount",
  surcharge: "Surcharge",
  shipping: "Shipping",
  netTotal: "Net total",
  taxAtRate: "plus VAT {rate}",
  taxIncludedAtRate: "incl. VAT {rate}",
  taxTotal: "VAT total",
  grandTotal: "Total",
  paid: "Paid",
  outstanding: "Amount due",

  page: "Page {page} of {pages}",
};

const de: InvoiceLabels = {
  invoice: "Rechnung",
  creditNote: "Stornorechnung",

  invoiceNumber: "Rechnungs-Nr.",
  creditNoteNumber: "Storno-Nr.",
  documentDate: "Datum",
  orderCode: "Bestellung",
  orderDate: "Bestelldatum",
  customerNumber: "Kunden-Nr.",
  cancelsInvoice: "Storniert Rechnung {sequentialId}",

  billTo: "Rechnungsanschrift",
  shipTo: "Lieferanschrift",
  vatId: "USt-IdNr.",
  taxNumber: "Steuer-Nr.",
  registrationNumber: "Register",
  email: "E-Mail",
  phone: "Telefon",
  website: "Web",

  position: "Pos.",
  description: "Bezeichnung",
  sku: "Art.-Nr.",
  quantity: "Menge",
  unitPriceNet: "Einzelpreis (netto)",
  unitPriceGross: "Einzelpreis (brutto)",
  taxRate: "MwSt.",
  lineTotalNet: "Summe (netto)",
  lineTotalGross: "Summe (brutto)",

  itemsTotal: "Zwischensumme",
  discount: "Rabatt",
  surcharge: "Zuschlag",
  shipping: "Versand",
  netTotal: "Nettobetrag",
  taxAtRate: "zzgl. MwSt. {rate}",
  taxIncludedAtRate: "inkl. MwSt. {rate}",
  taxTotal: "MwSt. gesamt",
  grandTotal: "Rechnungsbetrag",
  paid: "Bezahlt",
  outstanding: "Offener Betrag",

  page: "Seite {page} von {pages}",
};

/**
 * Keyed by the primary subtag of a BCP 47 locale. Anything not listed here falls back
 * to English rather than printing untranslated keys.
 */
export const DEFAULT_LABELS: Record<string, InvoiceLabels> = { en, de };

export function labelsForLocale(locale: string): InvoiceLabels {
  const language = locale.toLowerCase().split(/[-_]/)[0];
  return DEFAULT_LABELS[language] ?? DEFAULT_LABELS.en;
}
