/**
 * Purely presentational settings. Unlike the snapshot these are *not* stored per
 * document: restyling the template is expected to change how older invoices re-render,
 * while their content stays fixed.
 */
export interface InvoiceTheme {
  fontSize: {
    title: number;
    heading: number;
    body: number;
    small: number;
    tiny: number;
  };
  color: {
    text: string;
    muted: string;
    /** Used for the title, table header rule and total row. */
    accent: string;
    zebra: string;
    border: string;
  };
  table: {
    /** Alternating row background. Set `zebra` to `false` for a plain table. */
    zebra: boolean;
    padding: number;
  };
  /** Point width reserved for the totals block on the right hand side. */
  totalsWidth: number;
  /** Vertical space reserved above the page footer, in points. */
  footerGap: number;
}

export const DEFAULT_THEME: InvoiceTheme = {
  fontSize: {
    title: 20,
    heading: 11,
    body: 9.5,
    small: 8,
    tiny: 6.5,
  },
  color: {
    text: "#111827",
    muted: "#6b7280",
    accent: "#111827",
    zebra: "#f3f4f6",
    border: "#d1d5db",
  },
  table: {
    zebra: true,
    padding: 6,
  },
  totalsWidth: 250,
  footerGap: 14,
};

export function mergeTheme(overrides?: DeepPartialTheme): InvoiceTheme {
  return {
    fontSize: { ...DEFAULT_THEME.fontSize, ...overrides?.fontSize },
    color: { ...DEFAULT_THEME.color, ...overrides?.color },
    table: { ...DEFAULT_THEME.table, ...overrides?.table },
    totalsWidth: overrides?.totalsWidth ?? DEFAULT_THEME.totalsWidth,
    footerGap: overrides?.footerGap ?? DEFAULT_THEME.footerGap,
  };
}

export type DeepPartialTheme = {
  [K in keyof InvoiceTheme]?: InvoiceTheme[K] extends object ? Partial<InvoiceTheme[K]> : InvoiceTheme[K];
};
