import { FileGenerationResult, FileStrategy, SnapshotStrategy } from "@danielbiegler/vendure-plugin-invoices";
import { Order, RequestContext } from "@vendure/core";
import PDFDocument from "pdfkit";

// TODO make customizable
export class PdfkitSnapshotStrategy implements SnapshotStrategy<PdfkitSnapshot> {
  async generate(ctx: RequestContext, sequentialId: string, order: Order): Promise<PdfkitSnapshot> {
    return {
      order: {
        code: order.code,
      },
      input: {
        pdfkitOptions: {
          layout: "portrait",
          lang: "de-DE",
          info: {
            CreationDate: new Date(),
          },
          size: "A4",
          margin: 64,
        },
        invoice: {
          brandName: "",
          sequentialId,
          // @ts-expect-error uhhhh what to do if undefined?
          date: order.orderPlacedAt,
          merchant: {
            name: "",
            address: "",
            zipCode: "",
            area: "",
            vatId: ""
          },
          customer: {
            name: "",
            address: "",
            zipCode: "",
            area: "",
            vatId: undefined,
            email: undefined
          },
          sumGross: 0,
          sumTax: 0,
          sumTotalWithTax: 0,
          orderLines: []
        }
      }
    }
  }
}

const FONT_SIZE_XL = 20;
const FONT_SIZE_BASE = 11;
const FONT_SIZE_SM = 9;
const FONT_SIZE_XS = 8;
const FONT_SIZE_XXS = 6;
const FONT_BASE = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

// TODO make configurable
const LOCALE = "de-DE";
const CURRENCY_OPTIONS: Intl.NumberFormatOptions = { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 };
const PERCENT_OPTIONS: Intl.NumberFormatOptions = { style: "percent", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 };

export class PdfkitFileStrategy implements FileStrategy<PdfkitSnapshot> {
  async generate(
    ctx: RequestContext,
    sequentialId: string,
    snapshot: PdfkitSnapshot
  ): Promise<FileGenerationResult> {
    const filename = `${sequentialId}.pdf`;
    const buffer = await createInvoice(snapshot.input);

    return { filename, buffer };
  }
}

export async function createInvoice(input: CreateInvoiceInput) {
  const doc = new PDFDocument(input.pdfkitOptions);

  generateHeader(doc, input);

  doc.moveDown(2);
  generateTable(doc, input);
  doc.moveDown(3);

  generateFooter(doc, input);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));
    doc.end();
  });
}

/**
 * # TODO make labels configurable
 */
function generateHeader(doc: PDFKit.PDFDocument, input: CreateInvoiceInput) {
  doc
    .font(FONT_BOLD)
    .fontSize(FONT_SIZE_XL)
    .text(`Rechnung`)
    .font(FONT_BASE)
    .fontSize(FONT_SIZE_BASE)
    .moveDown()

    // Merchant
    .text("Rechnung von:", { align: "right" })
    .moveDown()
    .font(FONT_BOLD)
    .text(input.invoice.merchant.name, { align: "right" })
    .font(FONT_BASE)
    .text(input.invoice.merchant.address, { align: "right" })
    .text(`${input.invoice.merchant.zipCode} ${input.invoice.merchant.area}`, { align: "right" })
    .text(`${input.invoice.merchant.vatId}`, { align: "right" })
    .moveDown()

    // Meta
    .text(`Rechnungs-Nr.:  ${input.invoice.sequentialId}`, { align: "right" })
    .text(`Datum:  ${input.invoice.date}`, { align: "right" })
    .moveDown(2)

    // Customer
    .text("Rechnung an:")
    .moveDown()
    .fontSize(FONT_SIZE_BASE)
    .font(FONT_BOLD)
    .text(input.invoice.customer.name)
    .font(FONT_BASE)
    .text(input.invoice.customer.address)
    .text(`${input.invoice.customer.zipCode} ${input.invoice.customer.area}`)
    .text(input.invoice.customer.vatId ?? "")
    .text(input.invoice.customer.email ?? "")
    .moveDown(3)

    .text(input.invoice.headerText ?? "")
}

function generateFooter(doc: PDFKit.PDFDocument, input: CreateInvoiceInput) {
  doc
    .fontSize(FONT_SIZE_XXS)
    .text(input.invoice.footerText ?? "");
}

/**
 * # TODO make labels configurable
 */
function generateTable(doc: PDFKit.PDFDocument, input: CreateInvoiceInput) {
  doc.table({
    defaultStyle: {
      padding: 8,
      align: { x: "right", y: "center" },
      border: false,
    },
    rowStyles: i => ({
      backgroundColor: i % 2 === 0 ? "#eaeaea" : undefined,
    }),
    columnStyles: i => ({
      minWidth: i === 0 ? 210 : 0,
    }),
    data: [
      [ // Header
        { border: { bottom: 1 }, align: { x: "left" }, font: { size: FONT_SIZE_XS }, text: "Bezeichnung" },
        { border: { bottom: 1 }, font: { size: FONT_SIZE_XS }, text: "Menge" },
        { border: { bottom: 1 }, font: { size: FONT_SIZE_XS }, text: "Einzelpreis (Brutto)" },
        { border: { bottom: 1 }, font: { size: FONT_SIZE_XS }, text: "MwSt. %" },
        { border: { bottom: 1 }, font: { size: FONT_SIZE_XS }, text: "Summe" },
      ],

      ...input.invoice.orderLines.map<(string | PDFKit.Mixins.CellOptions)[]>(ol => {
        return [
          { align: { x: "left" }, font: { size: FONT_SIZE_SM }, text: ol.label },
          { font: { size: FONT_SIZE_SM }, text: ol.quantity.toString() },
          { font: { size: FONT_SIZE_SM }, text: Intl.NumberFormat(LOCALE, CURRENCY_OPTIONS).format(ol.pricePerUnitGross) },
          { font: { size: FONT_SIZE_SM }, text: Intl.NumberFormat(LOCALE, PERCENT_OPTIONS).format(ol.taxPercent) },
          { font: { size: FONT_SIZE_SM }, text: Intl.NumberFormat(LOCALE, CURRENCY_OPTIONS).format(ol.priceTotalWithTax) },
        ];
      }),

      // Summary

      [ // Sum
        { border: { top: 1 }, font: { size: FONT_SIZE_XS }, colSpan: 4, text: "Zwischensumme" },
        { border: { top: 1 }, font: { size: FONT_SIZE_SM }, text: Intl.NumberFormat(LOCALE, CURRENCY_OPTIONS).format(input.invoice.sumGross) },
      ],

      [ // Tax
        { font: { size: FONT_SIZE_XS }, colSpan: 4, text: `inkl. MwSt.` },
        { font: { size: FONT_SIZE_SM }, text: Intl.NumberFormat(LOCALE, CURRENCY_OPTIONS).format(input.invoice.sumTax) },
      ],

      [ // Grand Total
        { font: { size: FONT_SIZE_XS }, colSpan: 4, text: "Rechnungsbetrag" },
        { font: { size: FONT_SIZE_SM }, text: Intl.NumberFormat(LOCALE, CURRENCY_OPTIONS).format(input.invoice.sumTotalWithTax) },
      ],
    ]
  })
}

export type PdfkitSnapshot = {
  order: {
    code: string;
  }
  input: CreateInvoiceInput;
}


export type CreateInvoiceInput = {
  pdfkitOptions?: PDFKit.PDFDocumentOptions;
  invoice: {
    brandName: string;
    sequentialId: string;
    date: Date;
    merchant: {
      name: string;
      address: string;
      zipCode: string;
      area: string;
      vatId: string;
    }
    customer: {
      name: string;
      address: string;
      zipCode: string;
      area: string;
      vatId?: string;
      email?: string;
    }
    sumGross: number;
    sumTax: number;
    sumTotalWithTax: number;
    orderLines: Array<{
      label: string;
      quantity: string;
      pricePerUnitGross: number;
      taxPercent: number;
      tax: number;
      priceTotalWithTax: number;
    }>
    // TODO shipping
    // TODO surcharges
    headerText?: string;
    footerText?: string;
  }
}
