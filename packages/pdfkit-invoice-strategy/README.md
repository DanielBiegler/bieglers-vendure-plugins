# Vendure Strategy: PDFKit Invoices

PDF generation for [`@danielbiegler/vendure-plugin-invoices`][invoices], built on [PDFKit][pdfkit].
No headless browser, no HTML templating — the document is drawn directly, which keeps invoice
generation a fast, in-process operation with no extra runtime to install.

<a href="https://www.npmjs.com/package/@danielbiegler/vendure-pdfkit-invoice-strategy" target="_blank">
  <img src="https://badge.fury.io/js/@danielbiegler%2Fvendure-pdfkit-invoice-strategy.svg" alt="npm version badge" height="18">
</a>

## Features

- A complete business invoice: sender and recipient blocks, document metadata, item table,
  discounts, surcharges, shipping, per-rate tax breakdown, payments and an outstanding amount.
- Credit notes, rendered as the mirror image of the invoice they cancel.
- Net or gross price display, per shop or per order.
- Built-in `en` and `de` label sets, every string overridable.
- Ships with a font covering Latin, Greek and Cyrillic, so umlauts and non-Latin customer names
  print correctly out of the box.
- Correct money handling: amounts stay in Vendure's minor units and are formatted with the
  precision of your configured `MoneyStrategy`.
- Multi-page documents with a repeating page footer and `Page x of y`.
- Custom fonts, logo, colours and page geometry.

## How it works

The package ships the two halves the invoices plugin asks for:

| Strategy                 | Responsibility                                                       |
| ------------------------ | -------------------------------------------------------------------- |
| `PdfkitSnapshotStrategy` | Reads the `Order` and writes a self-contained, JSON serializable record |
| `PdfkitFileStrategy`     | Renders that record into a PDF, reading nothing else                  |

The split is what makes re-generating a five year old invoice produce the same document: prices,
product names, your own address and even the wording of the labels are copied into the snapshot at
issue time, and the renderer never consults the live database.

The corollary: changes to the *presentation* options (theme, fonts, logo) **do** apply retroactively
when an old document is rendered again. Content is frozen, styling is not.

## 1. Install

```bash
npm i @danielbiegler/vendure-pdfkit-invoice-strategy
```

## 2. Configure

```ts
import { InvoicesPlugin, StaticSequentialIdStrategy } from "@danielbiegler/vendure-plugin-invoices";
import { PdfkitFileStrategy, PdfkitSnapshotStrategy } from "@danielbiegler/vendure-pdfkit-invoice-strategy";

export const config: VendureConfig = {
  plugins: [
    InvoicesPlugin.init({
      prefixStrategy: new StaticSequentialIdStrategy("INVOICE"),
      storageStrategy: new LocalAssetStorageStrategy(path.join(__dirname, "invoices")),

      snapshotStrategy: new PdfkitSnapshotStrategy({
        merchant: {
          name: "Musterhandel GmbH",
          address: {
            streetLine1: "Beispielstraße 12",
            postalCode: "50667",
            city: "Köln",
            country: "Deutschland",
          },
          email: "rechnung@musterhandel.example",
          vatId: "DE123456789",
          footerColumns: [
            { heading: "Kontakt", lines: ["+49 221 1234567", "rechnung@musterhandel.example"] },
            { heading: "Bankverbindung", lines: ["IBAN DE02 1001 0010 0000 0123 45"] },
          ],
        },
        locale: "de-DE",
        texts: {
          intro: "Vielen Dank für Ihre Bestellung.",
          outro: "Zahlbar ohne Abzug innerhalb von 14 Tagen.",
        },
      }),

      fileStrategy: new PdfkitFileStrategy({
        logo: { src: path.join(__dirname, "logo.png"), fit: [160, 56] },
      }),
    }),
  ],
};
```

`merchant` is required and has no sensible default: Vendure stores no postal address or VAT ID for
a `Seller`, so the issuing party has to come from your configuration.

## Multi-vendor

Every snapshot option accepts a function of the `Order`, which is how one plugin instance serves
many sellers:

```ts
new PdfkitSnapshotStrategy({
  merchant: async (ctx, order) => merchantForChannel(ctx.channel),
  locale: (ctx) => (ctx.channel.defaultLanguageCode === "de" ? "de-DE" : "en-GB"),
});
```

Combine it with `sequenceSelectionStrategy: new DefaultSequenceSelectionStrategy({ scope: "channel" })`
on the invoices plugin so each seller also gets their own
gapless invoice sequence.

## Customizing

### Labels

`en` and `de` ship built in and are picked by the primary subtag of the resolved locale, falling
back to English. Override individual strings — `{placeholder}` segments are interpolated:

```ts
new PdfkitSnapshotStrategy({
  merchant,
  labels: { invoice: "Rechnung / Invoice", taxAtRate: "zzgl. {rate} MwSt." },
});
```

### Net or gross item prices

```ts
new PdfkitSnapshotStrategy({ merchant, priceDisplay: "gross" });
```

`"net"` (the default) prints net unit prices and adds the tax below the net total. `"gross"` prints
gross unit prices and lists the tax as *contained* in the total.

### Line descriptions

```ts
new PdfkitSnapshotStrategy({
  merchant,
  describeLine: (ctx, line) => ({
    name: line.productVariant.name,
    sku: line.productVariant.sku,
    details: [`Serial: ${line.customFields.serialNumber}`],
  }),
});
```

### Theme

```ts
new PdfkitFileStrategy({
  theme: {
    color: { accent: "#0f766e" },
    table: { zebra: false },
  },
});
```

### Fonts

Documents are set in [Noto Sans][noto], which is bundled with the package. It covers Latin
(including Central European, Baltic, Turkish and Vietnamese), Greek and Cyrillic — so
`Grüße`, `Київ`, `Καφές` and `İstanbul` all print as written, with no configuration.
Only the glyphs a document actually uses are embedded, which costs a few kB per PDF.

Scripts beyond that — CJK, Hebrew, Arabic, Indic — need a font of their own. Covering them costs
tens of megabytes, so point `fonts` at one you choose:

```ts
new PdfkitFileStrategy({
  fonts: {
    regular: path.join(__dirname, "fonts/NotoSansJP-Regular.ttf"),
    bold: path.join(__dirname, "fonts/NotoSansJP-Bold.ttf"),
  },
});
```

To carry no embedded font at all, opt back in to PDFKit's built-ins:

```ts
import { STANDARD_FONTS } from "@danielbiegler/vendure-pdfkit-invoice-strategy";

new PdfkitFileStrategy({ fonts: STANDARD_FONTS });
```

> [!IMPORTANT]
> `STANDARD_FONTS` only encodes WinAnsi. Anything outside Latin-1 — Greek, Cyrillic, Polish,
> Turkish — is silently mangled in the output, including in customer names and addresses.

Swapping the typeface changes how the text flows, so a document may gain or lose a page.
Nothing about its content changes.

### Anything else

`decorate` hands you the live PDFKit document after the content is drawn and before the footers,
which is where a watermark, an extra page or an embedded attachment belongs:

```ts
new PdfkitFileStrategy({
  decorate: (doc, snapshot) => {
    if (snapshot.totals.outstanding === 0) doc.fontSize(48).fillColor("#22c55e").text("PAID", 200, 400);
  },
});
```

## Credit notes

When the invoices plugin passes a `cancels` invoice, the snapshot is marked as a credit note, titled
accordingly, references the cancelled document and **negates every amount**. That matches German
`Stornorechnung` practice and how most bookkeeping imports expect a cancellation to look. Pass
`negateCreditNoteAmounts: false` for positive amounts under a credit note heading instead.

Only full cancellations are supported today; a credit note for a partial refund still mirrors the
whole order.

## Previewing a template change

Renders the bundled sample order — simple, multilingual, net, gross, multi-page and credit note
variants — into `preview/`, without booting Vendure:

```bash
npm run preview
```

## End-To-End Tests

```bash
npm run e2e
```

Covers the renderer directly (page breaks, credit notes, formatting) and a full round trip: a real
order is placed against a test server and the resulting PDF is read back off disk and checked
against the order's own totals.

## Known limitations

- The item table does not repeat its column headers after a page break — PDFKit's table has no
  support for it.
- Amounts of individual promotions may differ by one minor unit from the sum they are derived from,
  because Vendure distributes order-level discounts across lines and rounds per line. The legally
  relevant totals are taken from Vendure verbatim and are always exact.

## Third party licenses

Noto Sans is bundled under the [SIL Open Font License 1.1](./assets/fonts/OFL.txt),
© 2022 The Noto Project Authors.

[invoices]: https://www.npmjs.com/package/@danielbiegler/vendure-plugin-invoices
[noto]: https://fonts.google.com/noto/specimen/Noto+Sans
[pdfkit]: https://pdfkit.org/
