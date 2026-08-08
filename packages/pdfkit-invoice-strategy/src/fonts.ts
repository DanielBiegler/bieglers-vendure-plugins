import { readFileSync } from "node:fs";
import path from "node:path";

export interface InvoiceFonts {
  regular: string | Buffer;
  bold: string | Buffer;
}

/**
 * Resolved against this module instead of the process, so the same code works whether the
 * package is consumed from `dist` or run straight from `src` — both sit one level below the
 * package root. Bundling the plugin into a single file breaks this; pass `fonts` explicitly there.
 */
const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");

/** Noto Sans v2.015, SIL Open Font License 1.1 — see `assets/fonts/OFL.txt`. */
export const BUNDLED_FONT_FILES = {
  regular: path.join(FONT_DIR, "NotoSans-Regular.ttf"),
  bold: path.join(FONT_DIR, "NotoSans-Bold.ttf"),
} as const;

/**
 * PDFKit's built-in fonts, kept as an opt-out for shops that would rather not carry an embedded
 * font subset in every document. They only encode WinAnsi, so anything outside Latin-1 — Greek,
 * Cyrillic, Turkish, Polish, Vietnamese — is silently mangled in the output.
 */
export const STANDARD_FONTS: InvoiceFonts = { regular: "Helvetica", bold: "Helvetica-Bold" };

/** Re-reading ~430 KB per weight off disk for every invoice is pure waste; the bytes never change. */
const cache = new Map<string, Buffer>();

function load(file: string): Buffer {
  const cached = cache.get(file);
  if (cached) return cached;

  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch (cause) {
    throw new Error(
      `Could not read the bundled invoice font at "${file}". If this package was bundled or its ` +
        `assets were pruned, pass your own \`fonts\` to the file strategy, or STANDARD_FONTS to ` +
        `fall back to PDFKit's WinAnsi-only built-ins.`,
      { cause },
    );
  }

  cache.set(file, bytes);
  return bytes;
}

/**
 * The default typeface: Latin (including Central European, Baltic, Turkish and Vietnamese),
 * Greek and Cyrillic. Scripts beyond that — CJK, Hebrew, Arabic, Indic — need a font of their
 * own, which is why they are not bundled: covering them costs tens of megabytes.
 */
export function bundledFonts(): InvoiceFonts {
  return { regular: load(BUNDLED_FONT_FILES.regular), bold: load(BUNDLED_FONT_FILES.bold) };
}
