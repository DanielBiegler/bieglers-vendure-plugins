import { describe, expect, test } from "vitest";
import { STANDARD_FONTS } from "../src/fonts";
import { createFormatter, interpolate } from "../src/format";
import { labelsForLocale } from "../src/labels";
import { renderInvoice } from "../src/render";
import { extractText, pageCount, squash } from "./pdf-text";
import {
  createMultilingualSnapshot,
  createSampleSnapshot,
  createSimpleSnapshot,
  withManyLines,
} from "./sample-snapshot";

describe("renderInvoice", () => {
  test("produces a single page PDF for a typical order", async () => {
    const pdf = await renderInvoice(createSimpleSnapshot(), { compress: false });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
  });

  test("prints the identifying data a reader needs to match invoice to order", async () => {
    const pdf = await renderInvoice(createSampleSnapshot(), { compress: false });
    const text = extractText(pdf);

    expect(text).toContain("INVOICE01042");
    expect(text).toContain("GJ7T2K9QWERTY");
    expect(text).toContain("Musterhandel GmbH");
    expect(text).toContain("Erika Mustermann");
    expect(text).toContain("ESP-CLASSICO");
    expect(text).toContain("DE123456789");
  });

  test("shows the gross grand total and both tax rates", async () => {
    const snapshot = createSampleSnapshot();
    const text = squash(extractText(await renderInvoice(snapshot, { compress: false })));
    const fmt = createFormatter(snapshot.format);

    expect(text).toContain(squash(fmt.money(snapshot.totals.totalWithTax)));
    expect(text).toContain(squash(snapshot.labels.grandTotal));
    expect(text).toContain(squash(interpolate(snapshot.labels.taxAtRate, { rate: fmt.percent(19) })));
    expect(text).toContain(squash(interpolate(snapshot.labels.taxAtRate, { rate: fmt.percent(7) })));
  });

  test("breaks a long item table across pages and numbers every one of them", async () => {
    const snapshot = withManyLines(createSampleSnapshot(), 60);
    const pdf = await renderInvoice(snapshot, { compress: false });
    const text = squash(extractText(pdf));

    const pages = pageCount(pdf);
    expect(pages).toBeGreaterThan(1);
    for (let page = 1; page <= pages; page++) {
      expect(text).toContain(squash(interpolate(snapshot.labels.page, { page, pages })));
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
    const text = extractText(pdf);

    expect(text).toContain(snapshot.labels.creditNote);
    expect(text).toContain(interpolate(snapshot.labels.cancelsInvoice, { sequentialId: "INVOICE01042" }));
  });

  test("falls back to English labels for locales without a built-in set", () => {
    expect(labelsForLocale("de-AT").invoice).toBe(labelsForLocale("de").invoice);
    expect(labelsForLocale("ja-JP").invoice).toBe(labelsForLocale("en").invoice);
  });
});

describe("fonts", () => {
  test("keeps Greek, Cyrillic and Latin diacritics intact with the default font", async () => {
    const text = extractText(await renderInvoice(createMultilingualSnapshot(), { compress: false }));

    expect(text).toContain("Καφές Ελλάδα ΑΕ");
    expect(text).toContain("Ольга Ковалевська");
    expect(text).toContain("Київ");
    expect(text).toContain("Grüße aus Köln");
    expect(text).toContain("dziękujemy");
    expect(text).toContain("İstanbul'a teşekkürler");
  });

  test("embeds the default font as a subset so the document is self-contained", async () => {
    const pdf = (await renderInvoice(createSampleSnapshot(), { compress: false })).toString("latin1");

    // The six letter tag is what marks an embedded subset rather than a whole face.
    expect(pdf).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Regular/);
    expect(pdf).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Bold/);
    expect(pdf).toContain("/FontFile2");
  });

  test("STANDARD_FONTS opts out of the embedded subset", async () => {
    const pdf = await renderInvoice(createSampleSnapshot(), { compress: false, fonts: STANDARD_FONTS });

    expect(pdf.toString("latin1")).toContain("/BaseFont /Helvetica");
    expect(pdf.toString("latin1")).not.toContain("/FontFile2");
    // WinAnsi still covers Latin-1, so the everyday case reads back correctly.
    expect(extractText(pdf)).toContain("Beispielstraße 12");
    expect(extractText(pdf)).toContain("Köln");
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
