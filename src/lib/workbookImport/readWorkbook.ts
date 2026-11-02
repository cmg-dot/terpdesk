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

export type SingleSheet = { ok: true; data: SheetGrid } | { ok: false; error: string };

/**
 * Reads ONE sheet by name (the exact name first, so nothing else in a big workbook is parsed; otherwise a name that
 * differs in capitals or punctuation is found by reading every sheet). Used by the historical-jobs import.
 */
export async function readSingleSheet(buffer: Buffer, wanted: string): Promise<SingleSheet> {
  try {
    try {
      return { ok: true, data: await readSheet<string>(buffer, wanted, READ_OPTIONS) };
    } catch (err) {
      if (!(err instanceof SheetNotFoundError)) throw err;
    }
    const sheets = await readXlsxFile<string>(buffer, READ_OPTIONS);
    const found = sheets.find((s) => sheetKey(s.sheet) === sheetKey(wanted));
    if (found) return { ok: true, data: found.data };
    const have = sheets.map((s) => `"${s.sheet}"`).join(", ");
    return { ok: false, error: `The workbook has no sheet named "${wanted}". Sheets found: ${have || "none"}.` };
  } catch (err) {
    if (err instanceof InvalidInputError || err instanceof InvalidSpreadsheetError) {
      return { ok: false, error: "That file isn't a readable .xlsx workbook. If it is an older .xls file, open it in Excel and save it as .xlsx." };
    }
    throw err;
  }
}
