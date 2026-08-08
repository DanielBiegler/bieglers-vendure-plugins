/**
 * A deliberately small PDF text extractor for the test suite.
 *
 * Embedded TrueType subsets are written with an Identity-H encoding, so the bytes in the
 * content stream are glyph ids of that particular subset, not characters — the readable text
 * only exists in each font's `/ToUnicode` CMap. Reading the text back the way a PDF viewer or a
 * bookkeeping importer would therefore also asserts that we emit a correct CMap, which is what
 * keeps a rendered invoice searchable and copy-pasteable.
 *
 * Only what PDFKit actually emits is handled, and only with `compress: false`.
 */

type Objects = Map<string, string>;

/**
 * UTF-16BE, the encoding every value in a `/ToUnicode` CMap uses. Whitespace is stripped
 * because PDFKit separates the code units of a multi-character value — a ligature glyph maps
 * to `<0066 0066>` for "ff" — and those spaces are not part of the number.
 */
const decodeUtf16 = (hex: string) => Buffer.from(hex.replace(/\s/g, ""), "hex").swap16().toString("utf16le");

function indexObjects(pdf: string): Objects {
  const objects: Objects = new Map();
  for (const [, id, body] of pdf.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) objects.set(id, body);
  return objects;
}

function streamOf(body: string): string {
  return /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(body)?.[1] ?? "";
}

/** Glyph id (as an unpadded hex string) to the text it stands for. */
type CMap = Map<string, string>;

function parseCMap(cmap: string): CMap {
  const map: CMap = new Map();
  const code = (hex: string) => parseInt(hex, 16).toString(16);

  for (const [, block] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, src, dst] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f][0-9A-Fa-f\s]*)>/g)) {
      map.set(code(src), decodeUtf16(dst));
    }
  }

  for (const [, block] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    // Per-glyph array form: `<lo> <hi> [<u> <u> …]`, which is what PDFKit emits. Consumed
    // before the contiguous form below, whose shape otherwise also matches triples of
    // neighbouring entries *inside* one of these arrays.
    const remainder = block.replace(
      /<([0-9A-Fa-f]+)>\s*<[0-9A-Fa-f]+>\s*\[([^\]]*)\]/g,
      (_match, lo: string, list: string) => {
        const start = parseInt(lo, 16);
        [...list.matchAll(/<([0-9A-Fa-f\s]*)>/g)].forEach(([, dst], offset) => {
          map.set((start + offset).toString(16), dst ? decodeUtf16(dst) : "");
        });
        return "";
      },
    );

    // Contiguous form: `<lo> <hi> <ustart>`.
    for (const [, lo, hi, dst] of remainder.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const first = decodeUtf16(dst).codePointAt(0) ?? 0;
      for (let c = parseInt(lo, 16); c <= parseInt(hi, 16); c++) {
        map.set(c.toString(16), String.fromCodePoint(first + c - parseInt(lo, 16)));
      }
    }
  }

  return map;
}

interface Font {
  cmap?: CMap;
}

function fontsOfPage(objects: Objects, page: string): Map<string, Font> {
  const resources = /\/Resources (\d+) 0 R/.exec(page);
  const dict = resources ? (objects.get(resources[1]) ?? "") : page;
  const fonts = new Map<string, Font>();

  const block = /\/Font\s*<<([\s\S]*?)>>/.exec(dict)?.[1] ?? "";
  for (const [, name, id] of block.matchAll(/\/(\w+) (\d+) 0 R/g)) {
    const toUnicode = /\/ToUnicode (\d+) 0 R/.exec(objects.get(id) ?? "");
    // A standard font has no CMap; its bytes are already WinAnsi characters.
    fonts.set(name, { cmap: toUnicode ? parseCMap(streamOf(objects.get(toUnicode[1]) ?? "")) : undefined });
  }

  return fonts;
}

function decode(hex: string, font: Font | undefined): string {
  if (!font?.cmap) return Buffer.from(hex, "hex").toString("latin1");

  // Identity-H addresses glyphs with two bytes apiece.
  const glyphs = hex.match(/[0-9A-Fa-f]{4}/g) ?? [];
  return glyphs.map((glyph) => font.cmap!.get(parseInt(glyph, 16).toString(16)) ?? "").join("");
}

/**
 * The text of every page, in drawing order. Fragments are concatenated with no separator:
 * PDFKit splits a single `text()` call wherever it applies kerning, and a value that wraps
 * inside a column loses the space it broke on. Assert on `squash`ed substrings, not on layout.
 */
export function extractText(buffer: Buffer): string {
  const pdf = buffer.toString("latin1");
  const objects = indexObjects(pdf);
  let text = "";

  for (const body of objects.values()) {
    if (!/\/Type\s*\/Page[^s]/.test(body)) continue;

    const fonts = fontsOfPage(objects, body);
    const contents = /\/Contents (\d+) 0 R/.exec(body);
    const stream = streamOf(objects.get(contents?.[1] ?? "") ?? "");

    let current: Font | undefined;
    for (const [, selected, hex] of stream.matchAll(/\/(\w+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>/g)) {
      if (selected !== undefined) current = fonts.get(selected);
      else if (hex) text += decode(hex, current);
    }
  }

  return text;
}

/** Kerning and column padding make whitespace unreliable; comparisons ignore it. */
export const squash = (value: string) => value.replace(/\s/gu, "");

/** The page tree dictionary is never inside a compressed stream. */
export const pageCount = (buffer: Buffer) =>
  Number(/\/Count (\d+)/.exec(buffer.toString("latin1"))?.[1]);
