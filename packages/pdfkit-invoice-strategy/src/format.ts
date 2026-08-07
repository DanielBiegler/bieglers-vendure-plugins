import type { Money, PdfkitSnapshotFormat } from "./types";

export interface InvoiceFormatter {
  /** Minor units in, localized currency string out. */
  money(value: Money): string;
  /** Takes a percentage as Vendure stores it, e.g. `19` for 19%. */
  percent(rate: number): string;
  date(iso: string | null | undefined): string;
}

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: "medium" };

export function createFormatter(format: PdfkitSnapshotFormat): InvoiceFormatter {
  const currency = new Intl.NumberFormat(format.locale, {
    style: "currency",
    currency: format.currencyCode,
    // The MoneyStrategy decides the scale of the stored integers, which may disagree
    // with what Intl considers usual for the currency, so it wins over the default.
    minimumFractionDigits: format.precision,
    maximumFractionDigits: format.precision,
  });

  // Tax rates are rarely fractional but VAT of e.g. 8.1% exists, so trailing
  // zeroes are suppressed instead of forcing two decimals onto every rate.
  const percent = new Intl.NumberFormat(format.locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const date = new Intl.DateTimeFormat(format.locale, format.dateOptions ?? DEFAULT_DATE_OPTIONS);
  const divisor = Math.pow(10, format.precision);

  return {
    money: (value) => currency.format(value / divisor),
    percent: (rate) => percent.format(rate / 100),
    date: (iso) => {
      if (!iso) return "";
      const parsed = new Date(iso);
      return Number.isNaN(parsed.getTime()) ? "" : date.format(parsed);
    },
  };
}

export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Drops empty segments so that a missing street or province leaves no blank line. */
export function joinNonEmpty(parts: Array<string | undefined | null>, separator = " "): string {
  return parts.filter((part) => !!part && part.trim().length > 0).join(separator);
}
