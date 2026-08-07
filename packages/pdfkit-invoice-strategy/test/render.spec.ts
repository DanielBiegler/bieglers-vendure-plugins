import { describe, expect, test } from "vitest";
import { createFormatter, interpolate } from "../src/format";
import { labelsForLocale } from "../src/labels";
import { renderInvoice } from "../src/render";
import { createSampleSnapshot, withManyLines } from "./sample-snapshot";

/**
 * With compression off, drawn text sits in the content streams as `<hex>` strings inside
 * TJ arrays. PDFKit splits a single string across several of them wherever it applies
 * kerning, so the fragments are concatenated back together before anything is asserted.
 */
const readable = (buffer: Buffer) =>
  (buffer.toString("latin1").match(/<[0-9A-Fa-f]{2,}>/g) ?? [])
    .map((hex) => Buffer.from(hex.slice(1, -1), "hex").toString("latin1"))
    .join("");

/** The page tree dictionary is never inside a compressed stream. */
const pageCount = (buffer: Buffer) => Number(/\/Count (\d+)/.exec(buffer.toString("latin1"))?.[1]);

/** Whitespace does not survive the round trip predictably, currency symbols do not either. */
const squash = (value: string) => value.replace(/[\s  ]/g, "");

describe("renderInvoice", () => {
  test("produces a single page PDF for a typical order", async () => {
    const pdf = await renderInvoice(createSampleSnapshot(), { compress: false });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
  });

  test("prints the identifying data a reader needs to match invoice to order", async () => {
    const pdf = await renderInvoice(createSampleSnapshot(), { compress: false });
    const text = readable(pdf);

    expect(text).toContain("INVOICE01042");
    expect(text).toContain("GJ7T2K9QWERTY");
    expect(text).toContain("Musterhandel GmbH");
    expect(text).toContain("Erika Mustermann");
    expect(text).toContain("ESP-CLASSICO");
    expect(text).toContain("DE123456789");
  });

  test("shows the gross grand total and both tax rates", async () => {
    const snapshot = createSampleSnapshot();
    const text = squash(readable(await renderInvoice(snapshot, { compress: false })));
    const fmt = createFormatter(snapshot.format);

    // The currency symbol is re-encoded to WinAnsi, so only the amount is compared.
    expect(text).toContain("609,04");
    expect(text).toContain(squash(snapshot.labels.grandTotal));
    expect(text).toContain(squash(interpolate(snapshot.labels.taxAtRate, { rate: fmt.percent(19) })));
    expect(text).toContain(squash(interpolate(snapshot.labels.taxAtRate, { rate: fmt.percent(7) })));
  });

  test("breaks a long item table across pages and numbers every one of them", async () => {
    const snapshot = withManyLines(createSampleSnapshot(), 60);
    const pdf = await renderInvoice(snapshot, { compress: false });
    const text = readable(pdf);

    const pages = pageCount(pdf);
    expect(pages).toBeGreaterThan(1);
    for (let page = 1; page <= pages; page++) {
      expect(squash(text)).toContain(squash(interpolate(snapshot.labels.page, { page, pages })));
    }
  });

  test("renders a credit note under its own heading", async () => {
    const snapshot = createSampleSnapshot({
      document: {
        kind: "credit-note",
        sequentialId: "INVOICE01043",
        issuedAt: "2026-03-20T09:15:00.000Z",
        cancels: { sequentialId: "INVOICE01042", issuedAt: "2026-03-17T09:15:00.000Z" },
      },
    });
    const pdf = await renderInvoice(snapshot, { compress: false });
    const text = readable(pdf);

    expect(text).toContain(snapshot.labels.creditNote);
    expect(text).toContain(interpolate(snapshot.labels.cancelsInvoice, { sequentialId: "INVOICE01042" }));
  });

  test("falls back to English labels for locales without a built-in set", () => {
    expect(labelsForLocale("de-AT").invoice).toBe(labelsForLocale("de").invoice);
    expect(labelsForLocale("ja-JP").invoice).toBe(labelsForLocale("en").invoice);
  });
});

describe("createFormatter", () => {
  test("scales minor units by the configured money precision", () => {
    const twoPlaces = createFormatter({ locale: "en-US", currencyCode: "USD", precision: 2, priceDisplay: "net" });
    const threePlaces = createFormatter({ locale: "en-US", currencyCode: "USD", precision: 3, priceDisplay: "net" });

    expect(twoPlaces.money(12345)).toBe("$123.45");
    expect(threePlaces.money(12345)).toBe("$12.345");
  });

  test("treats tax rates as percentages, not fractions", () => {
    const fmt = createFormatter({ locale: "en-US", currencyCode: "EUR", precision: 2, priceDisplay: "net" });

    expect(fmt.percent(19)).toBe("19%");
    expect(fmt.percent(8.1)).toBe("8.1%");
  });
});
