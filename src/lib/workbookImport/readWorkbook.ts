import readXlsxFile, { InvalidInputError, InvalidSpreadsheetError, SheetNotFoundError, readSheet } from "read-excel-file/node";
import type { SheetGrid } from "@/lib/workbookImport/sheets";
import { NON_STATE_SHEET, STATE_SHEET } from "@/lib/workbookImport/types";

/**
 * The only file that touches the Excel library. SERVER ONLY.
 * Picks the two sheets we need out of an .xlsx by name (case and punctuation do not matter).
 * Numbers are kept as their exact text ("58.5"), so a rate is never altered by floating point.
 *
 * A big workbook can carry large extra sheets, so the two sheets are read by their exact names first (only those are
 * parsed). Only when a name differs in capitals or punctuation does it fall back to reading every sheet.
 */

export type WorkbookSheets = { ok: true; state: SheetGrid; nonState: SheetGrid } | { ok: false; error: string };

const sheetKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** An .xlsx is a zip archive. Rejects anything else before it reaches the parser. */
export const looksLikeXlsx = (bytes: Uint8Array): boolean => ZIP_MAGIC.every((byte, index) => bytes[index] === byte);

const READ_OPTIONS = { parseNumber: (text: string) => text };

export async function readWorkbookSheets(buffer: Buffer): Promise<WorkbookSheets> {
  let sheets: { sheet: string; data: SheetGrid }[];
  try {
    try {
      sheets = [
        { sheet: STATE_SHEET, data: await readSheet<string>(buffer, STATE_SHEET, READ_OPTIONS) },
        { sheet: NON_STATE_SHEET, data: await readSheet<string>(buffer, NON_STATE_SHEET, READ_OPTIONS) },
      ];
    } catch (err) {
      if (!(err instanceof SheetNotFoundError)) throw err;
      sheets = await readXlsxFile<string>(buffer, READ_OPTIONS);
    }
  } catch (err) {
    if (err instanceof InvalidInputError || err instanceof InvalidSpreadsheetError) {
      return { ok: false, error: "That file isn't a readable .xlsx workbook. If it is an older .xls file, open it in Excel and save it as .xlsx." };
    }
    throw err;
  }

  const find = (wanted: string): SheetGrid | null => sheets.find((s) => sheetKey(s.sheet) === sheetKey(wanted))?.data ?? null;
  const state = find(STATE_SHEET);
  const nonState = find(NON_STATE_SHEET);
  const missing = [state ? null : STATE_SHEET, nonState ? null : NON_STATE_SHEET].filter((name): name is string => name !== null);
  if (!state || !nonState) {
    const have = sheets.map((s) => `"${s.sheet}"`).join(", ");
    return { ok: false, error: `The workbook is missing the sheet ${missing.map((m) => `"${m}"`).join(" and ")}. Sheets found: ${have || "none"}.` };
  }
  return { ok: true, state, nonState };
}

export type MatchedSheet = { ok: true; name: string; data: SheetGrid; others: string[] } | { ok: false; error: string };

/**
 * Finds the sheet whose NAME matches a pattern (e.g. any name containing "Job", capitals ignored) and reads it. The names
 * are only known by reading the workbook, so every sheet is read once. If several sheets match, the first in the workbook
 * is used and the others are reported (never read), so nothing is silently merged. Used by the historical-jobs import.
 */
export async function readSheetMatching(buffer: Buffer, pattern: RegExp, label: string): Promise<MatchedSheet> {
  let sheets: { sheet: string; data: SheetGrid }[];
  try {
    sheets = await readXlsxFile<string>(buffer, READ_OPTIONS);
  } catch (err) {
    if (err instanceof InvalidInputError || err instanceof InvalidSpreadsheetError) {
      return { ok: false, error: "That file isn't a readable .xlsx workbook. If it is an older .xls file, open it in Excel and save it as .xlsx." };
    }
    throw err;
  }
  const matches = sheets.filter((s) => pattern.test(s.sheet));
  if (matches.length === 0) {
    const have = sheets.map((s) => `"${s.sheet}"`).join(", ");
    return { ok: false, error: `The workbook has no sheet whose name contains "${label}". Sheets found: ${have || "none"}.` };
  }
  return { ok: true, name: matches[0].sheet, data: matches[0].data, others: matches.slice(1).map((m) => m.sheet) };
}
