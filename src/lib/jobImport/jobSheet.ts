import { createHash } from "crypto";
import { cellText, parseDateCell } from "@/lib/workbookImport/cells";
import type { SheetGrid } from "@/lib/workbookImport/sheets";
import type { ImportNote } from "@/lib/workbookImport/types";
import { splitInterpreterNames } from "@/lib/jobImport/split";
import { parseTimeCell, toUtcIsoInZone } from "@/lib/jobImport/timeCells";
import { JOBS_IANA_ZONE, JOBS_SHEET, MAX_JOB_ROWS } from "@/lib/jobImport/types";
import type { JobRow } from "@/lib/jobImport/types";

/**
 * Turns the cell grid of the Jobs sheet into scrubbed job rows. Headers are found by name in the top rows, so a title
 * row or a different column order does not matter. A row whose date or times can't be read is skipped and listed; it
 * never stops the other rows. SERVER ONLY (it fingerprints rows with Node's crypto).
 */

const HEADER_SEARCH_ROWS = 15;

const COLUMNS = {
  date: ["date", "appointmentdate", "jobdate", "servicedate", "startdate", "dateofservice", "dateofappointment"],
  startTime: ["starttime", "start", "timestart", "begintime", "begin"],
  endTime: ["endtime", "end", "timeend", "finishtime", "finish"],
  interpreter: [
    "interpreter", "interpreters", "interpretername", "interpreternames", "assignedinterpreter", "assignedinterpreters",
    "interpreterassigned", "interpretersassigned", "interpretersassignedtojob", "assigned", "assignedto", "terp", "terps",
  ],
} as const;
type Field = keyof typeof COLUMNS;
const REQUIRED: Field[] = ["date", "startTime", "endTime", "interpreter"];

const normalizeHeader = (header: unknown): string => String(header ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const label = (header: unknown): string => String(header ?? "").replace(/\s+/g, " ").trim();

export interface JobSheetExtract {
  rows: JobRow[];
  notes: ImportNote[];
  /** Data rows read, including skipped ones (blank lines are not counted). */
  rowsRead: number;
  rowsSkipped: number;
  /** Non-empty column headers this import does not use. */
  unusedColumns: string[];
}

export type JobSheetResult = { ok: true; value: JobSheetExtract } | { ok: false; error: string };

const fingerprint = (row: readonly unknown[]): string =>
  createHash("sha256")
    .update(JSON.stringify(row.map((cell) => (cell instanceof Date ? cell.toISOString() : (cellText(cell) ?? "")))))
    .digest("hex")
    .slice(0, 32);

export const extractJobRows = (grid: SheetGrid): JobSheetResult => {
  let headerIndex = -1;
  let columns: Record<Field, number> | null = null;
  for (let index = 0; index < Math.min(grid.length, HEADER_SEARCH_ROWS) && columns === null; index += 1) {
    const headers = grid[index].map(normalizeHeader);
    const found = {} as Record<Field, number>;
    for (const field of Object.keys(COLUMNS) as Field[]) {
      // Exact header names only: "Interpreter Email" must never be mistaken for the interpreter column.
      found[field] = headers.findIndex((header) => header !== "" && (COLUMNS[field] as readonly string[]).includes(header));
    }
    if (found.date !== -1 && found.startTime !== -1 && found.endTime !== -1 && found.interpreter !== -1) {
      headerIndex = index;
      columns = found;
    }
  }
  if (!columns) {
    const seen = grid.slice(0, HEADER_SEARCH_ROWS).map((r) => r.map(label).filter(Boolean)).find((r) => r.length >= 2) ?? [];
    return {
      ok: false,
      error: `Couldn't find the Date, Start Time, End Time and Interpreter columns on the "${JOBS_SHEET}" sheet. ${seen.length > 0 ? `The first headers found were: ${seen.slice(0, 15).join(", ")}.` : "No headers were found."}`,
    };
  }

  const data = grid.slice(headerIndex + 1);
  if (data.length > MAX_JOB_ROWS) return { ok: false, error: `The "${JOBS_SHEET}" sheet has more than ${MAX_JOB_ROWS} rows. Split the file and import it in parts.` };

  const used = new Set<number>(REQUIRED.map((field) => columns![field]));
  const unusedColumns = grid[headerIndex].map((h, i) => (used.has(i) ? "" : label(h))).filter(Boolean);

  const notes: ImportNote[] = [];
  const rows: JobRow[] = [];
  const seen = new Set<string>();
  let rowsRead = 0;
  let rowsSkipped = 0;

  data.forEach((cells, offset) => {
    if (!cells.some((cell) => cellText(cell) !== null || cell instanceof Date)) return;
    rowsRead += 1;
    const line = headerIndex + 2 + offset;
    const where = `${JOBS_SHEET}, row ${line}`;
    const skip = (message: string) => {
      rowsSkipped += 1;
      notes.push({ where, message: `${message} Row skipped.` });
    };

    const date = parseDateCell(cells[columns!.date]);
    const start = parseTimeCell(cells[columns!.startTime]);
    const end = parseTimeCell(cells[columns!.endTime]);
    if (date.value === null) return skip(date.problem ? `Date ${date.problem}.` : "No date.");
    if (start.value === null) return skip(start.problem ? `Start time ${start.problem}.` : "No start time.");
    if (end.value === null) return skip(end.problem ? `End time ${end.problem}.` : "No end time.");

    const startsAt = toUtcIsoInZone(date.value, start.value, JOBS_IANA_ZONE);
    const endsAt = toUtcIsoInZone(date.value, end.value, JOBS_IANA_ZONE);
    if (startsAt === null || endsAt === null) return skip("The date and times don't make a valid moment.");
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return skip(`The end time (${end.value}) is not after the start time (${start.value}).`);

    // The same row (every cell identical) twice is one job.
    const contentHash = fingerprint(cells);
    if (seen.has(contentHash)) return;
    seen.add(contentHash);

    const interpreterText = cellText(cells[columns!.interpreter]);
    rows.push({ line, date: date.value, startTime: start.value, endTime: end.value, startsAt, endsAt, interpreterText, names: splitInterpreterNames(interpreterText), contentHash });
  });

  return { ok: true, value: { rows, notes, rowsRead, rowsSkipped, unusedColumns } };
};
