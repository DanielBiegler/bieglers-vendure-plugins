import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderInvoice } from "../src/render";
import { createSampleSnapshot, withManyLines } from "./sample-snapshot";

/**
 * Renders the sample snapshot to disk so a template change can be eyeballed without
 * booting Vendure and placing an order.
 *
 * ```
 * npm run preview --workspace @danielbiegler/vendure-pdfkit-invoice-strategy
 * ```
 */
async function main() {
  const outDir = resolve(__dirname, "../preview");
  mkdirSync(outDir, { recursive: true });

  const documents: Array<[string, Buffer]> = [
    ["invoice-net.pdf", await renderInvoice(createSampleSnapshot())],
    [
      "invoice-gross.pdf",
      await renderInvoice(
        createSampleSnapshot({ format: { ...createSampleSnapshot().format, priceDisplay: "gross" } }),
      ),
    ],
    ["invoice-multipage.pdf", await renderInvoice(withManyLines(createSampleSnapshot(), 60))],
    [
      "credit-note.pdf",
      await renderInvoice(
        createSampleSnapshot({
          document: {
            kind: "credit-note",
            sequentialId: "INVOICE01043",
            issuedAt: new Date().toISOString(),
            cancels: { sequentialId: "INVOICE01042" },
          },
        }),
      ),
    ],
  ];

  for (const [filename, buffer] of documents) {
    const target = resolve(outDir, filename);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buffer);
    // eslint-disable-next-line no-console
    console.log(`${target} (${(buffer.length / 1024).toFixed(1)} kB)`);
  }
}

void main();
