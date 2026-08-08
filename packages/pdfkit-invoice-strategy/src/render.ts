import PDFDocument from "pdfkit";
import { bundledFonts, InvoiceFonts } from "./fonts";
import { createFormatter, interpolate, InvoiceFormatter, joinNonEmpty } from "./format";
import { DeepPartialTheme, InvoiceTheme, mergeTheme } from "./theme";
import { InvoiceAddress, PdfkitSnapshot } from "./types";

export interface InvoiceLogo {
  /** File path or raw bytes. A path is read synchronously by PDFKit. */
  src: string | Buffer;
  /** Bounding box in points, aspect ratio is preserved. */
  fit?: [number, number];
}

export interface RenderInvoiceOptions {
  theme?: DeepPartialTheme;
  /**
   * Override when your customers write in a script the bundled Noto Sans does not cover
   * (CJK, Hebrew, Arabic, Indic), or pass STANDARD_FONTS to drop the embedded subset.
   *
   * @default bundledFonts()
   */
  fonts?: InvoiceFonts;
  logo?: InvoiceLogo;
  /**
   * Runs after everything else has been drawn but before the page footers, with the
   * live PDFKit document. The escape hatch for anything this template does not cover,
   * e.g. stamping a watermark or embedding a ZUGFeRD attachment.
   */
  decorate?: (doc: PDFKit.PDFDocument, snapshot: PdfkitSnapshot) => void | Promise<void>;

  /**
   * Turning compression off leaves the content streams as readable text, which is what
   * makes the output greppable for tests or downstream text extraction. Costs file size.
   *
   * @default true
   */
  compress?: boolean;
}

interface RenderContext {
  doc: PDFKit.PDFDocument;
  snapshot: PdfkitSnapshot;
  theme: InvoiceTheme;
  fmt: InvoiceFormatter;
  fonts: { regular: string; bold: string };
  /** Horizontal extent of the content area, precomputed because it is needed everywhere. */
  left: number;
  right: number;
  width: number;
}

const FONT_REGULAR = "invoice-regular";
const FONT_BOLD = "invoice-bold";

export async function renderInvoice(
  snapshot: PdfkitSnapshot,
  options: RenderInvoiceOptions = {},
): Promise<Buffer> {
  const theme = mergeTheme(options.theme);
  const fmt = createFormatter(snapshot.format);

  const doc = new PDFDocument({
    size: snapshot.page.size,
    layout: snapshot.page.layout,
    margins: snapshot.page.margins,
    lang: snapshot.page.lang,
    displayTitle: !!snapshot.page.title,
    info: documentInfo(snapshot),
    // "Page x of y" is unknowable until the last page exists, so pages are held back
    // and the footers are painted once the content is complete.
    bufferPages: true,
    compress: options.compress ?? true,
  });

  const ctx: RenderContext = {
    doc,
    snapshot,
    theme,
    fmt,
    fonts: registerFonts(doc, options.fonts),
    left: doc.page.margins.left,
    right: doc.page.width - doc.page.margins.right,
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
  };

  drawMerchantHeader(ctx, options.logo);
  drawParties(ctx);
  drawTitle(ctx);
  drawText(ctx, snapshot.texts.intro);
  drawItemsTable(ctx);
  drawTotals(ctx);
  drawText(ctx, snapshot.texts.outro);

  await options.decorate?.(doc, snapshot);

  drawFooters(ctx);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/**
 * PDFKit stringifies every entry of `info` unconditionally, so an `undefined` value
 * crashes document creation rather than being ignored.
 */
function documentInfo(snapshot: PdfkitSnapshot): PDFKit.DocumentInfo {
  const info: PDFKit.DocumentInfo = {
    // Anchored to the issue date so that re-generating a document reproduces the
    // original instead of drifting with wall-clock time.
    CreationDate: new Date(snapshot.document.issuedAt),
  };

  if (snapshot.page.title) info.Title = snapshot.page.title;
  if (snapshot.page.author) info.Author = snapshot.page.author;
  if (snapshot.page.subject) info.Subject = snapshot.page.subject;
  if (snapshot.page.keywords) info.Keywords = snapshot.page.keywords;

  return info;
}

function registerFonts(doc: PDFKit.PDFDocument, fonts: InvoiceFonts = bundledFonts()) {
  // Standard font names pass through `registerFont` untouched, so STANDARD_FONTS needs no
  // special casing here.
  doc.registerFont(FONT_REGULAR, fonts.regular);
  doc.registerFont(FONT_BOLD, fonts.bold);
  return { regular: FONT_REGULAR, bold: FONT_BOLD };
}

// #region Header

function drawMerchantHeader(ctx: RenderContext, logo?: InvoiceLogo) {
  const { doc, theme, fonts, snapshot } = ctx;
  const { merchant, labels } = snapshot;
  const top = doc.page.margins.top;

  let logoBottom = top;
  if (logo) {
    const fit = logo.fit ?? [160, 56];
    doc.image(logo.src, ctx.right - fit[0], top, { fit, align: "right" });
    logoBottom = top + fit[1];
  }

  const textWidth = logo ? ctx.width - (logo.fit?.[0] ?? 160) - 24 : ctx.width;
  doc
    .font(fonts.bold)
    .fontSize(theme.fontSize.heading)
    .fillColor(theme.color.text)
    .text(merchant.name, ctx.left, top, { width: textWidth });

  const contact = [
    formatAddress(merchant.address),
    joinNonEmpty([
      merchant.phoneNumber && `${labels.phone}: ${merchant.phoneNumber}`,
      merchant.email && `${labels.email}: ${merchant.email}`,
      merchant.website,
    ], " · "),
  ];

  doc.font(fonts.regular).fontSize(theme.fontSize.small).fillColor(theme.color.muted);
  for (const block of contact.filter(Boolean)) {
    doc.text(block, ctx.left, doc.y, { width: textWidth });
  }

  doc.y = Math.max(doc.y, logoBottom) + 24;
}

/** Address block on the left, document metadata on the right. */
function drawParties(ctx: RenderContext) {
  const { doc, theme, fonts, snapshot, fmt } = ctx;
  const { customer, merchant, labels, document, order } = snapshot;

  const columnGap = 24;
  const leftWidth = Math.round(ctx.width * 0.52);
  const rightX = ctx.left + leftWidth + columnGap;
  const rightWidth = ctx.width - leftWidth - columnGap;
  const top = doc.y;

  // The one-line return address above the recipient, as expected on window envelopes.
  // doc
  //   .font(fonts.regular)
  //   .fontSize(theme.fontSize.tiny)
  //   .fillColor(theme.color.muted)
  //   .text(
  //     joinNonEmpty(
  //       [
  //         merchant.name,
  //         merchant.address.streetLine1,
  //         joinNonEmpty([merchant.address.postalCode, merchant.address.city], " "),
  //       ],
  //       " · ",
  //     ),
  //     ctx.left,
  //     top,
  //     { width: leftWidth },
  //   );
  // doc.moveDown(0.4);

  doc
    .fontSize(theme.fontSize.small)
    .fillColor(theme.color.muted)
    .text(labels.billTo, ctx.left, doc.y, { width: leftWidth })
    .fontSize(theme.fontSize.body)
    .fillColor(theme.color.text);

  const recipient = joinNonEmpty(
    [
      customer.billingAddress.company || customer.name,
      customer.billingAddress.company ? customer.name : undefined,
      formatAddress(customer.billingAddress),
      customer.vatId ? `${labels.vatId}: ${customer.vatId}` : undefined,
      customer.email,
    ],
    "\n",
  );
  doc.text(recipient, ctx.left, doc.y, { width: leftWidth });
  const leftBottom = doc.y;

  const meta: Array<[string, string]> = [
    [
      document.kind === "credit-note" ? labels.creditNoteNumber : labels.invoiceNumber,
      document.sequentialId,
    ],
    [labels.documentDate, fmt.date(document.issuedAt)],
    [labels.orderCode, order.code],
  ];
  if (order.placedAt) meta.push([labels.orderDate, fmt.date(order.placedAt)]);
  if (order.customerId) meta.push([labels.customerNumber, order.customerId]);
  if (merchant.vatId) meta.push([labels.vatId, merchant.vatId]);
  if (merchant.taxNumber) meta.push([labels.taxNumber, merchant.taxNumber]);

  const rightBottom = drawKeyValues(ctx, meta, rightX, top, rightWidth);

  // The shipping address only earns its space when it actually differs.
  let shippingBottom = leftBottom;
  if (customer.shippingAddress) {
    doc
      .font(fonts.regular)
      .fontSize(theme.fontSize.small)
      .fillColor(theme.color.muted)
      .text(labels.shipTo, ctx.left, leftBottom + 10, { width: leftWidth })
      .fontSize(theme.fontSize.body)
      .fillColor(theme.color.text)
      .text(
        joinNonEmpty([customer.shippingAddress.fullName, formatAddress(customer.shippingAddress)], "\n"),
        ctx.left,
        doc.y,
        { width: leftWidth },
      );
    shippingBottom = doc.y;
  }

  doc.y = Math.max(shippingBottom, rightBottom) + 28;
}

function drawTitle(ctx: RenderContext) {
  const { doc, theme, fonts, snapshot } = ctx;
  const { labels, document } = snapshot;
  const title = document.kind === "credit-note" ? labels.creditNote : labels.invoice;

  doc
    .font(fonts.bold)
    .fontSize(theme.fontSize.title)
    .fillColor(theme.color.accent)
    .text(`${title} ${document.sequentialId}`, ctx.left, doc.y, { width: ctx.width });

  if (document.cancels) {
    doc
      .font(fonts.regular)
      .fontSize(theme.fontSize.small)
      .fillColor(theme.color.muted)
      .text(interpolate(labels.cancelsInvoice, { sequentialId: document.cancels.sequentialId }), ctx.left, doc.y, {
        width: ctx.width,
      });
  }

  doc.y += 12;
}

function drawText(ctx: RenderContext, text?: string) {
  if (!text) return;

  const { doc, theme, fonts } = ctx;
  doc
    .font(fonts.regular)
    .fontSize(theme.fontSize.body)
    .fillColor(theme.color.text)
    .text(text, ctx.left, doc.y, { width: ctx.width, align: "left" });
  doc.y += 12;
}

// #region Items

function drawItemsTable(ctx: RenderContext) {
  const { doc, theme, fonts, snapshot, fmt } = ctx;
  const { labels, lines, format } = snapshot;
  const gross = format.priceDisplay === "gross";

  const header = [
    labels.position,
    labels.description,
    labels.quantity,
    gross ? labels.unitPriceGross : labels.unitPriceNet,
    labels.taxRate,
    gross ? labels.lineTotalGross : labels.lineTotalNet,
  ];

  const body = lines.map<PDFKit.Mixins.CellOptions[]>((line) => {
    const description = joinNonEmpty(
      [
        line.name,
        line.sku ? `${labels.sku}: ${line.sku}` : undefined,
        ...(line.details ?? []),
        ...line.discounts.map((d) => `${d.description}: ${fmt.money(gross ? d.amountWithTax : d.amount)}`),
      ],
      "\n",
    );

    return [
      { text: String(line.position), align: { x: "left" } },
      { text: description, align: { x: "left" } },
      { text: String(line.quantity) },
      { text: fmt.money(gross ? line.unitPriceWithTax : line.unitPrice) },
      { text: fmt.percent(line.taxRate) },
      { text: fmt.money(gross ? line.lineTotalWithTax : line.lineTotal) },
    ];
  });

  // Cells without an explicit `font` inherit whatever the document currently has set,
  // which is cheaper than repeating the font on every cell.
  doc.font(fonts.regular).fontSize(theme.fontSize.body);
  doc.table({
    defaultStyle: {
      border: false,
      padding: theme.table.padding,
      align: { x: "right", y: "center" },
      textColor: theme.color.text,
      // PDFKit truncates cell text with an ellipsis whenever the remaining cell height is
      // under two lines, which fires even when the text fits. A silently shortened product
      // name is worse than any layout it could save.
      textOptions: { ellipsis: false },
    },
    // Fixed widths on everything but the description, sized so that the longest built-in
    // header ("Einzelpreis (brutto)") stays on one line.
    columnStyles: [{ width: 36 }, { width: "*" }, { width: 42 }, { width: 90 }, { width: 46 }, { width: 88 }],
    rowStyles: (row) => ({
      // Row 0 is the header, which carries the rule instead of a fill.
      backgroundColor: theme.table.zebra && row > 0 && row % 2 === 0 ? theme.color.zebra : undefined,
    }),
    data: [
      header.map<PDFKit.Mixins.CellOptions>((text, i) => ({
        type: "TH",
        text,
        align: { x: i <= 1 ? "left" : "right" },
        font: { src: fonts.bold, size: theme.fontSize.small },
        textColor: theme.color.accent,
        border: { bottom: 1 },
        borderColor: theme.color.border,
      })),
      ...body,
    ],
  });

  doc.y += 16;
}

// #region Totals

function drawTotals(ctx: RenderContext) {
  const { doc, theme, fonts, snapshot, fmt } = ctx;
  const { labels, totals, taxes, discounts, surcharges, shipping, format } = snapshot;
  const gross = format.priceDisplay === "gross";
  const pick = (net: number, withTax: number) => (gross ? withTax : net);

  type Row = { label: string; value: string; emphasis?: boolean; rule?: boolean; size?: number };
  const rows: Row[] = [
    { label: labels.itemsTotal, value: fmt.money(pick(totals.items, totals.itemsWithTax)) },
    ...discounts.map((d) => ({
      label: joinNonEmpty([labels.discount, d.description], ": "),
      value: fmt.money(pick(d.amount, d.amountWithTax)),
    })),
    ...surcharges.map((s) => ({
      label: joinNonEmpty([labels.surcharge, s.description], ": "),
      value: fmt.money(pick(s.price, s.priceWithTax)),
    })),
    ...shipping.map((s) => ({
      label: joinNonEmpty([labels.shipping, s.description], ": "),
      value: fmt.money(pick(s.price, s.priceWithTax)),
    })),
  ];

  if (gross) {
    rows.push({ label: labels.grandTotal, value: fmt.money(totals.totalWithTax), emphasis: true, rule: true });
    rows.push(
      ...taxes.map((tax) => ({
        label: interpolate(labels.taxIncludedAtRate, {
          rate: fmt.percent(tax.taxRate),
          description: tax.description,
        }),
        value: fmt.money(tax.taxTotal),
      })),
    );
  } else {
    rows.push({ label: labels.netTotal, value: fmt.money(totals.total), rule: true });
    rows.push(
      ...taxes.map((tax) => ({
        label: interpolate(labels.taxAtRate, { rate: fmt.percent(tax.taxRate), description: tax.description }),
        value: fmt.money(tax.taxTotal),
      })),
    );
    rows.push({ label: labels.grandTotal, value: fmt.money(totals.totalWithTax), emphasis: true, rule: true });
  }

  if (totals.paid !== 0) {
    rows.push({ label: labels.paid, value: fmt.money(totals.paid) });
    rows.push({ label: labels.outstanding, value: fmt.money(totals.outstanding), emphasis: true });
  }

  const tableWidth = Math.min(theme.totalsWidth, ctx.width);
  doc.table({
    position: { x: ctx.right - tableWidth, y: doc.y },
    maxWidth: tableWidth,
    defaultStyle: {
      border: false,
      padding: { top: 3, bottom: 3, left: theme.table.padding, right: theme.table.padding },
      align: { x: "right", y: "center" },
    },
    columnStyles: [{ width: "*" }, { width: 100 }],
    data: rows.map<PDFKit.Mixins.CellOptions[]>((row) => {
      const style: PDFKit.Mixins.CellOptions = {
        font: {
          src: row.emphasis ? fonts.bold : fonts.regular,
          size: row.emphasis ? theme.fontSize.heading : theme.fontSize.body,
        },
        textColor: row.emphasis ? theme.color.accent : theme.color.text,
        border: row.rule ? { top: 1 } : false,
        borderColor: theme.color.border,
      };
      return [
        { ...style, text: row.label, align: { x: "left" } },
        { ...style, text: row.value },
      ];
    }),
  });

  doc.y += 20;
}

// #region Footer

function drawFooters(ctx: RenderContext) {
  const { doc } = ctx;
  const range = doc.bufferedPageRange();

  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    drawFooter(ctx, i + 1, range.count);
  }

  // Without flushing, switchToPage keeps every page in memory until end() and the
  // writes above would be appended to the wrong page.
  doc.flushPages();
}

function drawFooter(ctx: RenderContext, page: number, pages: number) {
  const { doc, theme, fonts, snapshot } = ctx;
  const { merchant, labels } = snapshot;

  const bottomMargin = doc.page.margins.bottom;
  // PDFKit starts a new page as soon as text crosses the bottom margin, which is
  // exactly the band the footer lives in, so the margin is lifted for the duration.
  doc.page.margins.bottom = 0;

  const bandTop = doc.page.height - bottomMargin + theme.footerGap;
  doc
    .moveTo(ctx.left, bandTop)
    .lineTo(ctx.right, bandTop)
    .lineWidth(0.5)
    .strokeColor(theme.color.border)
    .stroke();

  const columns = merchant.footerColumns ?? [];
  if (columns.length) {
    const gap = 12;
    const columnWidth = (ctx.width - gap * (columns.length - 1)) / columns.length;
    columns.forEach((column, index) => {
      const x = ctx.left + index * (columnWidth + gap);
      let y = bandTop + 6;
      if (column.heading) {
        doc
          .font(fonts.bold)
          .fontSize(theme.fontSize.tiny)
          .fillColor(theme.color.text)
          .text(column.heading, x, y, { width: columnWidth });
        y = doc.y;
      }
      doc
        .font(fonts.regular)
        .fontSize(theme.fontSize.tiny)
        .fillColor(theme.color.muted)
        .text(column.lines.join("\n"), x, y, { width: columnWidth });
    });
  }

  doc
    .font(fonts.regular)
    .fontSize(theme.fontSize.tiny)
    .fillColor(theme.color.muted)
    .text(
      interpolate(labels.page, { page, pages }),
      ctx.left,
      doc.page.height - bottomMargin + theme.footerGap - 10,
      { width: ctx.width, align: "right", lineBreak: false },
    );

  doc.page.margins.bottom = bottomMargin;
}

// #region Helpers

function drawKeyValues(
  ctx: RenderContext,
  pairs: Array<[string, string]>,
  x: number,
  y: number,
  width: number,
): number {
  const { doc, theme, fonts } = ctx;
  const labelWidth = Math.round(width * 0.5);
  let cursor = y;

  for (const [label, value] of pairs) {
    doc
      .font(fonts.regular)
      .fontSize(theme.fontSize.small)
      .fillColor(theme.color.muted)
      .text(label, x, cursor, { width: labelWidth, lineBreak: false });
    doc
      .font(fonts.bold)
      .fillColor(theme.color.text)
      .text(value, x + labelWidth, cursor, { width: width - labelWidth, align: "right", lineBreak: false });
    cursor += doc.currentLineHeight() + 3;
  }

  return cursor;
}

function formatAddress(address: InvoiceAddress): string {
  return joinNonEmpty(
    [
      address.streetLine1,
      address.streetLine2,
      joinNonEmpty([address.postalCode, address.city], " "),
      address.province,
      address.country,
    ],
    "\n",
  );
}
