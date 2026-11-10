import type { PDFFont } from "pdf-lib";

/**
 * Text fitting for the invoice. The built-in PDF fonts can only draw Western (WinAnsi) characters, so anything else is shown as
 * "?" rather than failing the whole PDF; line breaks and tabs inside a value are folded to spaces unless the caller wraps.
 * Pure: no I/O.
 */

const ELLIPSIS = "…";
const charSets = new WeakMap<PDFFont, Set<number>>();

const supported = (font: PDFFont): Set<number> => {
  let set = charSets.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charSets.set(font, set);
  }
  return set;
};

/** Letters that do not decompose into a base letter plus an accent, so the accent-stripping step below cannot reach them. */
const BASE_LETTER: Record<string, string> = { "Ł": "L", "ł": "l", "Đ": "D", "đ": "d" };

/** The character itself when the font can draw it, else its base letter without the accent (ź -> z), else "?". */
function drawable(set: Set<number>, ch: string): string {
  const code = ch.codePointAt(0);
  if (code !== undefined && set.has(code)) return ch;
  const base = BASE_LETTER[ch] ?? ch.normalize("NFD").charAt(0);
  const baseCode = base.codePointAt(0);
  return base !== ch && baseCode !== undefined && set.has(baseCode) ? base : "?";
}

/** One line of text the font can draw: control characters become spaces, characters it lacks become their base letter or "?". */
export function cleanLine(font: PDFFont, value: string): string {
  const set = supported(font);
  // Array.from walks whole characters, so an emoji (two UTF-16 units) becomes one "?".
  const out = Array.from(value.replace(/[\r\n\t\v\f]+/g, " ")).map((ch) => drawable(set, ch)).join("");
  return out.replace(/ {2,}/g, " ").trim();
}

const widthOf = (font: PDFFont, text: string, size: number): number => font.widthOfTextAtSize(text, size);

const truncate = (font: PDFFont, text: string, size: number, maxWidth: number): string => {
  if (widthOf(font, text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && widthOf(font, cut + ELLIPSIS, size) > maxWidth) cut = cut.slice(0, -1);
  return cut.trimEnd() + ELLIPSIS;
};

export interface FittedLine {
  text: string;
  size: number;
}

/** A single line, shrunk (never below `minSize`) to fit `maxWidth`, then cut with an ellipsis if it still does not. */
export function fitOneLine(font: PDFFont, value: string, size: number, maxWidth: number, minSize = 7): FittedLine {
  const text = cleanLine(font, value);
  let current = size;
  while (current > minSize && widthOf(font, text, current) > maxWidth) current -= 0.5;
  return { text: truncate(font, text, current, maxWidth), size: current };
}

/** `value` broken into lines no wider than `maxWidth`; its own line breaks are kept. A word wider than a line is split. */
export function wrapText(font: PDFFont, value: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const words = cleanLine(font, paragraph).split(" ").filter(Boolean);
    if (words.length === 0) {
      if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const attempt = line ? `${line} ${word}` : word;
      if (widthOf(font, attempt, size) <= maxWidth) {
        line = attempt;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (widthOf(font, line, size) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && widthOf(font, line.slice(0, cut), size) > maxWidth) cut -= 1;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    if (line) lines.push(line);
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export interface FittedBlock {
  lines: string[];
  size: number;
  /** The text did not fit even at `minSize`: the lines are cut (the last one ends with an ellipsis). */
  overflow: boolean;
}

/** A block of text in at most `maxLines` lines, shrinking from `size` down to `minSize` before it gives up and cuts. */
export function fitBlock(font: PDFFont, value: string, size: number, minSize: number, maxWidth: number, maxLines: number): FittedBlock {
  for (let current = size; ; current -= 0.5) {
    const lines = wrapText(font, value, current, maxWidth);
    if (lines.length <= maxLines) return { lines, size: current, overflow: false };
    if (current <= minSize) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = truncate(font, `${kept[maxLines - 1]} ${lines[maxLines] ?? ""}`.trim() + " " + ELLIPSIS, current, maxWidth);
      return { lines: kept, size: current, overflow: true };
    }
  }
}
