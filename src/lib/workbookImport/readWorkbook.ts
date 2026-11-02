import readXlsxFile, { InvalidInputError, InvalidSpreadsheetError } from "read-excel-file/node";
import type { SheetGrid } from "@/lib/workbookImport/sheets";
import { NON_STATE_SHEET, STATE_SHEET } from "@/lib/workbookImport/types";

/**
 * The only file that touches the Excel library. SERVER ONLY.
 * Reads every sheet of an .xlsx and picks the two we need by name (case and punctuation do not matter).
 * Numbers are kept as their exact text ("58.5"), so a rate is never altered by floating point.
 */

export type WorkbookSheets = { ok: true; state: SheetGrid; nonState: SheetGrid } | { ok: false; error: string };

const sheetKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** An .xlsx is a zip archive. Rejects anything else before it reaches the parser. */
export const looksLikeXlsx = (bytes: Uint8Array): boolean => ZIP_MAGIC.every((byte, index) => bytes[index] === byte);

export async function readWorkbookSheets(buffer: Buffer): Promise<WorkbookSheets> {
  let sheets: { sheet: string; data: SheetGrid }[];
  try {
    sheets = await readXlsxFile<string>(buffer, { parseNumber: (text) => text });
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
