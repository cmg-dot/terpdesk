import type { ImportNote, MergedInterpreter, NonStateRow, StateRow } from "@/lib/workbookImport/types";

export interface MergeResult {
  people: MergedInterpreter[];
  matched: number;
  /** Names that appear on only one sheet, as written on that sheet. */
  unmatchedState: string[];
  unmatchedNonState: string[];
  notes: ImportNote[];
}

/**
 * Joins the two sheets on the case-insensitive interpreter name (an inner match for people on both sheets; people on
 * only one sheet are kept with what that sheet gave). Names are compared by key only: no fuzzy matching, so a
 * misspelling shows up as two unmatched names instead of silently pairing the wrong people.
 *
 * Two different people cannot share an email (it is the unique key in the database): the later one is kept without it.
 */
export const mergeSheets = (stateRows: readonly StateRow[], nonStateRows: readonly NonStateRow[]): MergeResult => {
  const nonStateByKey = new Map(nonStateRows.map((row) => [row.key, row]));
  const stateKeys = new Set(stateRows.map((row) => row.key));
  const notes: ImportNote[] = [];
  const people: MergedInterpreter[] = [];
  let matched = 0;

  for (const state of stateRows) {
    const other = nonStateByKey.get(state.key);
    if (other) matched += 1;
    people.push({
      key: state.key,
      name: state.name,
      email: other?.email ?? null,
      city: state.city,
      certification: state.certification,
      qualifications: other?.qualifications ?? null,
      insuranceExpiration: other?.insuranceExpiration ?? null,
      stateRate: state.stateRate,
      kingCountyRate: state.kingCountyRate,
      nonStateRate: other?.nonStateRate ?? null,
    });
  }
  const onlyNonState = nonStateRows.filter((row) => !stateKeys.has(row.key));
  for (const other of onlyNonState) {
    people.push({
      key: other.key,
      name: other.name,
      email: other.email,
      city: null,
      certification: null,
      qualifications: other.qualifications,
      insuranceExpiration: other.insuranceExpiration,
      stateRate: null,
      kingCountyRate: null,
      nonStateRate: other.nonStateRate,
    });
  }

  const emailOwner = new Map<string, string>();
  const unique = people.map((person) => {
    if (!person.email) return person;
    const owner = emailOwner.get(person.email);
    if (owner === undefined) {
      emailOwner.set(person.email, person.name);
      return person;
    }
    notes.push({ where: "Interpreter non state + emails", message: `"${person.name}" has the same email as "${owner}"; imported without an email.` });
    return { ...person, email: null };
  });

  return {
    people: unique,
    matched,
    unmatchedState: stateRows.filter((row) => !nonStateByKey.has(row.key)).map((row) => row.name),
    unmatchedNonState: onlyNonState.map((row) => row.name),
    notes,
  };
};
