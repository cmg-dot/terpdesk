import { cellText, nameKey, parseDateCell, parseEmailCell, parseRate } from "@/lib/workbookImport/cells";
import type { Parsed } from "@/lib/workbookImport/cells";
import { MAX_SHEET_ROWS, NON_STATE_SHEET, STATE_SHEET } from "@/lib/workbookImport/types";
import type { ImportNote, NonStateRow, StateRow } from "@/lib/workbookImport/types";

/**
 * Turns the cell grid of one sheet into typed rows. Headers are found by name (not position) in the first rows, so a
 * title row above them or a reordered column does not matter. Pure functions, no I/O.
 */

export type SheetGrid = readonly (readonly unknown[])[];

export interface SheetExtract<R> {
  rows: R[];
  notes: ImportNote[];
}

type ExtractResult<R> = { ok: true; value: SheetExtract<R> } | { ok: false; error: string };

const HEADER_SEARCH_ROWS = 15;
const MAX_NAME = 200;
const MAX_CITY = 100;

const normalizeHeader = (header: unknown): string => String(header ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
/** Long aliases also match a header that merely starts with them ("Non State Rate 2 hr Min"). Short ones must match exactly. */
const headerMatches = (header: string, alias: string): boolean => header === alias || (alias.length >= 10 && header.startsWith(alias));

const STATE_COLUMNS = {
  name: ["interpretername", "name"],
  city: ["cityofresidence", "city"],
  certification: ["certification", "certifications"],
  stateRate: ["washingtonhourlyrate", "washingtonrate", "washingtonstaterate", "staterate"],
  kingCountyRate: ["kingcountyhourlyrate", "kingcountyrate"],
} as const;

const NON_STATE_COLUMNS = {
  name: ["interpretername", "name"],
  qualifications: ["qualifications", "qualification"],
  insuranceExpiration: ["dateofinsuranceexpiration", "insuranceexpiration", "insuranceexpirationdate"],
  email: ["interpreteremails", "interpreteremail", "emailaddress", "emails", "email"],
  // "Non State Rate 2 hr Min" is an HOURLY rate that is billed for at least 2 hours. It is stored exactly as written and
  // never divided or multiplied by the minimum.
  nonStateRate: ["nonstaterate2hrmin", "nonstaterate", "nonstatehourlyrate"],
} as const;

type Columns<K extends string> = Record<K, number | null>;

/** The first row (within the top rows) that has a name column plus at least one other known column. */
const locateHeader = <K extends string>(grid: SheetGrid, aliases: Record<K, readonly string[]>): { index: number; columns: Columns<K> } | null => {
  const fields = Object.keys(aliases) as K[];
  for (let index = 0; index < Math.min(grid.length, HEADER_SEARCH_ROWS); index += 1) {
    const headers = grid[index].map(normalizeHeader);
    const columns = {} as Columns<K>;
    for (const field of fields) {
      const found = headers.findIndex((header) => header !== "" && aliases[field].some((alias) => headerMatches(header, alias)));
      columns[field] = found === -1 ? null : found;
    }
    const others = fields.filter((field) => field !== "name" && columns[field] !== null);
    if ((columns as Record<string, number | null>).name !== null && others.length > 0) return { index, columns };
  }
  return null;
};

const NAME_COLUMN = "name";
const at = (row: readonly unknown[], column: number | null): unknown => (column === null ? undefined : row[column]);

/** Applies a field parser and records a note instead of failing when the cell is unusable. */
const field = <T>(parsed: Parsed<T>, label: string, where: string, notes: ImportNote[]): T | null => {
  if (parsed.problem) notes.push({ where, message: `${label} ${parsed.problem}; left blank.` });
  return parsed.value;
};

const clamp = (text: string | null, max: number, label: string, where: string, notes: ImportNote[]): string | null => {
  if (text !== null && text.length > max) {
    notes.push({ where, message: `${label} is longer than ${max} characters; shortened.` });
    return text.slice(0, max);
  }
  return text;
};

const extract = <K extends string, R extends { key: string; line: number; name: string }>(
  grid: SheetGrid,
  sheet: string,
  aliases: Record<K, readonly string[]>,
  build: (read: (column: K) => unknown, base: { line: number; key: string; name: string }, where: string, notes: ImportNote[]) => R,
): ExtractResult<R> => {
  const header = locateHeader(grid, aliases);
  if (!header) {
    const wanted = (Object.keys(aliases) as K[]).map((k) => aliases[k][0]).join(", ");
    return { ok: false, error: `Couldn't find the column headers on the "${sheet}" sheet (looked for: ${wanted}).` };
  }
  const data = grid.slice(header.index + 1);
  if (data.length > MAX_SHEET_ROWS) return { ok: false, error: `The "${sheet}" sheet has more than ${MAX_SHEET_ROWS} rows. Split the file and import it in parts.` };

  const notes: ImportNote[] = [];
  const rows: R[] = [];
  // The same name (ignoring capitals and extra spaces) can appear many times with slightly different details. The first
  // row read wins; later ones are dropped without a word, and their cells are never read, so they cannot raise notes.
  const seen = new Set<string>();
  data.forEach((row, offset) => {
    const line = header.index + 2 + offset;
    const where = `${sheet}, row ${line}`;
    const hasAnything = row.some((cell) => cellText(cell) !== null || cell instanceof Date);
    if (!hasAnything) return;
    const name = cellText(at(row, header.columns[NAME_COLUMN as K]));
    if (name === null) {
      notes.push({ where, message: "No interpreter name; row skipped." });
      return;
    }
    if (name.length > MAX_NAME) {
      notes.push({ where, message: `Name is longer than ${MAX_NAME} characters; row skipped.` });
      return;
    }
    const key = nameKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(build((column) => at(row, header.columns[column]), { line, key, name }, where, notes));
  });
  return { ok: true, value: { rows, notes } };
};

export const extractStateRows = (grid: SheetGrid): ExtractResult<StateRow> =>
  extract(grid, STATE_SHEET, STATE_COLUMNS, (read, base, where, notes) => ({
    ...base,
    city: clamp(cellText(read("city")), MAX_CITY, "City", where, notes),
    certification: cellText(read("certification")),
    stateRate: field(parseRate(read("stateRate")), "Washington rate", where, notes),
    kingCountyRate: field(parseRate(read("kingCountyRate")), "King County rate", where, notes),
  }));

export const extractNonStateRows = (grid: SheetGrid): ExtractResult<NonStateRow> =>
  extract(grid, NON_STATE_SHEET, NON_STATE_COLUMNS, (read, base, where, notes) => ({
    ...base,
    qualifications: cellText(read("qualifications")),
    insuranceExpiration: field(parseDateCell(read("insuranceExpiration")), "Insurance expiration", where, notes),
    email: field(parseEmailCell(read("email")), "Email", where, notes),
    nonStateRate: field(parseRate(read("nonStateRate")), "Non-state rate", where, notes),
  }));
