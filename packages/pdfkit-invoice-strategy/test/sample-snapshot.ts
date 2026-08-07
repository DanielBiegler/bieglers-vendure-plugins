import { DEFAULT_PAGE } from "../src/PdfkitSnapshotStrategy";
import { labelsForLocale } from "../src/labels";
import { PDFKIT_SNAPSHOT_VERSION, PdfkitSnapshot, PdfkitSnapshotLine } from "../src/types";

/**
 * A fully populated snapshot: discounts, surcharges, shipping, two tax rates and a
 * part payment, so that every branch of the template is exercised at once.
 */
export function createSampleSnapshot(overrides: Partial<PdfkitSnapshot> = {}): PdfkitSnapshot {
  const lines: PdfkitSnapshotLine[] = [
    {
      position: 1,
      name: "Espresso Machine Classico",
      sku: "ESP-CLASSICO",
      details: ["Colour: stainless steel"],
      quantity: 1,
      listUnitPrice: 49900,
      listUnitPriceWithTax: 59381,
      unitPrice: 44910,
      unitPriceWithTax: 53443,
      lineTotal: 44910,
      lineTotalWithTax: 53443,
      taxRate: 19,
      discounts: [{ description: "Launch promotion", amount: -4990, amountWithTax: -5938 }],
    },
    {
      position: 2,
      name: "Coffee beans, Ethiopia Sidamo, 1kg",
      sku: "BEAN-ET-1000",
      quantity: 3,
      listUnitPrice: 2400,
      listUnitPriceWithTax: 2568,
      unitPrice: 2400,
      unitPriceWithTax: 2568,
      lineTotal: 7200,
      lineTotalWithTax: 7704,
      taxRate: 7,
      discounts: [],
    },
  ];

  return {
    version: PDFKIT_SNAPSHOT_VERSION,
    document: {
      kind: "invoice",
      sequentialId: "INVOICE01042",
      issuedAt: "2026-03-17T09:15:00.000Z",
    },
    order: {
      code: "GJ7T2K9QWERTY",
      placedAt: "2026-03-16T18:02:00.000Z",
      state: "PaymentSettled",
      customerId: "4711",
    },
    format: {
      locale: "de-DE",
      currencyCode: "EUR",
      precision: 2,
      priceDisplay: "net",
    },
    merchant: {
      name: "Musterhandel GmbH",
      address: {
        streetLine1: "Beispielstrasse 12",
        postalCode: "50667",
        city: "Koeln",
        country: "Deutschland",
      },
      email: "rechnung@musterhandel.example",
      phoneNumber: "+49 221 1234567",
      website: "www.musterhandel.example",
      vatId: "DE123456789",
      taxNumber: "214/5678/9012",
      footerColumns: [
        { heading: "Musterhandel GmbH", lines: ["Beispielstrasse 12", "50667 Koeln"] },
        { heading: "Kontakt", lines: ["+49 221 1234567", "rechnung@musterhandel.example"] },
        { heading: "Bank", lines: ["Musterbank Koeln", "IBAN DE02 1001 0010 0000 0123 45"] },
        { heading: "Register", lines: ["HRB 12345, Amtsgericht Koeln", "USt-IdNr. DE123456789"] },
      ],
    },
    customer: {
      name: "Erika Mustermann",
      billingAddress: {
        company: "Beispiel AG",
        fullName: "Erika Mustermann",
        streetLine1: "Musterweg 3",
        postalCode: "10115",
        city: "Berlin",
        country: "Deutschland",
        countryCode: "DE",
      },
      shippingAddress: {
        fullName: "Erika Mustermann",
        streetLine1: "Packstation 123",
        postalCode: "10117",
        city: "Berlin",
        country: "Deutschland",
        countryCode: "DE",
      },
      email: "erika@beispiel.example",
      vatId: "DE987654321",
    },
    lines,
    discounts: [{ description: "Newsletter voucher", amount: -1000, amountWithTax: -1190 }],
    surcharges: [{ description: "Payment surcharge", sku: "SUR-COD", price: 300, priceWithTax: 357, taxRate: 19 }],
    shipping: [{ description: "Standard Shipping", price: 495, priceWithTax: 589, taxRate: 19 }],
    taxes: [
      { description: "Standard Tax", taxRate: 19, taxBase: 44710, taxTotal: 8495 },
      { description: "Reduced Tax", taxRate: 7, taxBase: 7200, taxTotal: 504 },
    ],
    totals: {
      items: 52110,
      itemsWithTax: 61147,
      discounts: -1000,
      discountsWithTax: -1190,
      surcharges: 300,
      surchargesWithTax: 357,
      shipping: 495,
      shippingWithTax: 589,
      subTotal: 51410,
      subTotalWithTax: 60314,
      tax: 8999,
      total: 51905,
      totalWithTax: 60904,
      paid: 30000,
      outstanding: 30904,
    },
    payments: [
      {
        method: "bank-transfer",
        amount: 30000,
        state: "Settled",
        date: "2026-03-16T18:05:00.000Z",
        transactionId: "TX-4711",
      },
    ],
    texts: {
      intro: "Vielen Dank fuer Ihre Bestellung.",
      outro: "Zahlbar ohne Abzug innerhalb von 14 Tagen nach Rechnungserhalt.",
    },
    labels: labelsForLocale("de"),
    page: DEFAULT_PAGE,
    ...overrides,
  };
}

/** Repeats the sample lines until the item table is guaranteed to break across pages. */
export function withManyLines(snapshot: PdfkitSnapshot, count: number): PdfkitSnapshot {
  const template = snapshot.lines[0];
  return {
    ...snapshot,
    lines: Array.from({ length: count }, (_, index) => ({
      ...template,
      position: index + 1,
      name: `${template.name} #${index + 1}`,
    })),
  };
}
