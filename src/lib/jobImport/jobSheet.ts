import { createHash } from "crypto";
import { cellText, parseDateCell } from "@/lib/workbookImport/cells";
import type { SheetGrid } from "@/lib/workbookImport/sheets";
import type { ImportNote } from "@/lib/workbookImport/types";
import { splitInterpreterNames } from "@/lib/jobImport/split";
import { parseTimeRange } from "@/lib/jobImport/timeRange";
import { toUtcIsoInZone } from "@/lib/jobImport/timeCells";
import { JOBS_IANA_ZONE, MAX_JOB_ROWS } from "@/lib/jobImport/types";
import type { JobRow } from "@/lib/jobImport/types";

/**
 * Turns the cell grid of the Jobs sheet into scrubbed job rows. The sheet has NO header row, so every column is read
 * by its 0-indexed position (see JOB_COLUMNS) and every row is data. A row whose date or shift can't be read (a title
 * line, a stray note) is skipped and listed; it never stops the other rows. SERVER ONLY (it fingerprints rows with
 * Node's crypto).
 */

/** 0-indexed positions in the Jobs sheet: column 1 is the SECOND column (B), column 0 is not used. */
export const JOB_COLUMNS = { date: 1, location: 2, timeRange: 3, interpreter: 6, consumer: 7 } as const;

const MAX_LOCATION = 300;
const MAX_CONSUMER = 200;

export interface JobSheetExtract {
  rows: JobRow[];
  notes: ImportNote[];
  /** Non-blank rows read, including skipped ones. */
  rowsRead: number;
  rowsSkipped: number;
}

export type JobSheetResult = { ok: true; value: JobSheetExtract } | { ok: false; error: string };

const hasContent = (cell: unknown): boolean => cellText(cell) !== null || cell instanceof Date;

const fingerprint = (row: readonly unknown[]): string =>
  createHash("sha256")
    .update(JSON.stringify(row.map((cell) => (cell instanceof Date ? cell.toISOString() : (cellText(cell) ?? "")))))
    .digest("hex")
    .slice(0, 32);

const clamp = (text: string | null, max: number): string | null => (text !== null && text.length > max ? text.slice(0, max) : text);

export const extractJobRows = (grid: SheetGrid, sheetName: string): JobSheetResult => {
  if (grid.length > MAX_JOB_ROWS) return { ok: false, error: `The "${sheetName}" sheet has more than ${MAX_JOB_ROWS} rows. Split the file and import it in parts.` };

  const notes: ImportNote[] = [];
  const rows: JobRow[] = [];
  const seen = new Set<string>();
  let rowsRead = 0;
  let rowsSkipped = 0;

  grid.forEach((cells, index) => {
    if (!cells.some(hasContent)) return;
    rowsRead += 1;
    const line = index + 1;
    const skip = (message: string) => {
      rowsSkipped += 1;
      notes.push({ where: `${sheetName}, row ${line}`, message: `${message} Row skipped.` });
    };

    const date = parseDateCell(cells[JOB_COLUMNS.date]);
    if (date.value === null) return skip(date.problem ? `Date ${date.problem}.` : "No date in column 2.");
    const range = parseTimeRange(cells[JOB_COLUMNS.timeRange]);
    if (range.value === null) return skip(range.problem ? `Time range ${range.problem}.` : "No time range in column 4.");

    const startsAt = toUtcIsoInZone(date.value, range.value.start, JOBS_IANA_ZONE);
    const endsAt = toUtcIsoInZone(date.value, range.value.end, JOBS_IANA_ZONE);
    if (startsAt === null || endsAt === null) return skip("The date and times don't make a valid moment.");

    // The same row (every cell identical) twice is one job.
    const contentHash = fingerprint(cells);
    if (seen.has(contentHash)) return;
    seen.add(contentHash);

    const interpreterText = cellText(cells[JOB_COLUMNS.interpreter]);
    rows.push({
      line,
      date: date.value,
      startTime: range.value.start,
      endTime: range.value.end,
      timeRange: range.value.text,
      startsAt,
      endsAt,
      location: clamp(cellText(cells[JOB_COLUMNS.location]), MAX_LOCATION),
      consumer: clamp(cellText(cells[JOB_COLUMNS.consumer]), MAX_CONSUMER),
      interpreterText,
      names: splitInterpreterNames(interpreterText),
      contentHash,
    });
  });

  return { ok: true, value: { rows, notes, rowsRead, rowsSkipped } };
};
