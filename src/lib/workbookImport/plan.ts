import { mergeSheets } from "@/lib/workbookImport/merge";
import { readWorkbookSheets } from "@/lib/workbookImport/readWorkbook";
import { extractNonStateRows, extractStateRows } from "@/lib/workbookImport/sheets";
import type { ImportNote, ImportReport, MergedInterpreter, SamplePerson } from "@/lib/workbookImport/types";

/**
 * Everything decided before the database is touched: read both sheets, validate each cell, join on the name.
 * SERVER ONLY (it reads the workbook).
 */

export const MAX_REPORTED_NOTES = 40;
export const MAX_REPORTED_NAMES = 25;
const SAMPLE_SIZE = 5;

export type ImportPlan = { ok: true; people: MergedInterpreter[]; report: Omit<ImportReport, "outcome"> } | { ok: false; error: string };

const toSample = (person: MergedInterpreter): SamplePerson => ({
  name: person.name,
  city: person.city,
  email: person.email,
  stateRate: person.stateRate,
  kingCountyRate: person.kingCountyRate,
  nonStateRate: person.nonStateRate,
});

export async function planImport(buffer: Buffer): Promise<ImportPlan> {
  const sheets = await readWorkbookSheets(buffer);
  if (!sheets.ok) return { ok: false, error: sheets.error };

  const state = extractStateRows(sheets.state);
  if (!state.ok) return { ok: false, error: state.error };
  const nonState = extractNonStateRows(sheets.nonState);
  if (!nonState.ok) return { ok: false, error: nonState.error };

  const merged = mergeSheets(state.value.rows, nonState.value.rows);
  const notes: ImportNote[] = [...state.value.notes, ...nonState.value.notes, ...merged.notes];
  const unmatched = (names: string[]) => names.slice(0, MAX_REPORTED_NAMES);

  return {
    ok: true,
    people: merged.people,
    report: {
      stateRows: state.value.rows.length,
      nonStateRows: nonState.value.rows.length,
      matched: merged.matched,
      onlyInState: merged.unmatchedState.length,
      onlyInNonState: merged.unmatchedNonState.length,
      people: merged.people.length,
      withoutEmail: merged.people.filter((p) => p.email === null).length,
      withCertification: merged.people.filter((p) => p.certification !== null).length,
      withQualifications: merged.people.filter((p) => p.qualifications !== null).length,
      unmatchedState: unmatched(merged.unmatchedState),
      unmatchedNonState: unmatched(merged.unmatchedNonState),
      notes: notes.slice(0, MAX_REPORTED_NOTES),
      notesTotal: notes.length,
      sample: merged.people.slice(0, SAMPLE_SIZE).map(toSample),
    },
  };
}
