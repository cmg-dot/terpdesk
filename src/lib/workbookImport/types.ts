/** Shared shapes for the Excel bulk import. Pure types: safe to import from client components. */

export const STATE_SHEET = "Interpreter State Rate";
export const NON_STATE_SHEET = "Interpreter non state + emails";

/** 5 MB. The hosting platform may refuse request bodies larger than about 4.5 MB before they reach the app. */
export const MAX_WORKBOOK_BYTES = 5_000_000;
export const MAX_CERTIFICATION_CHARS = 500;
export const MAX_SHEET_ROWS = 2_000;

/** A row from "Interpreter State Rate". Rates are numeric text ("58.00") or null. */
export interface StateRow {
  line: number;
  key: string;
  name: string;
  city: string | null;
  certification: string | null;
  stateRate: string | null;
  kingCountyRate: string | null;
}

/** A row from "Interpreter non state + emails". `insuranceExpiration` is yyyy-MM-dd or null. */
export interface NonStateRow {
  line: number;
  key: string;
  name: string;
  qualifications: string | null;
  insuranceExpiration: string | null;
  email: string | null;
  nonStateRate: string | null;
}

/** One person after the two sheets are joined on their name. Anything the sheets did not give is null. */
export interface MergedInterpreter {
  key: string;
  name: string;
  email: string | null;
  city: string | null;
  /** The State sheet's Certification and the non-state sheet's Qualifications, combined (see mergeSheets). */
  certification: string | null;
  insuranceExpiration: string | null;
  stateRate: string | null;
  kingCountyRate: string | null;
  nonStateRate: string | null;
}

/** Something worth the user's attention. Holds a sheet name and a row number, never a person's details. */
export interface ImportNote {
  where: string;
  message: string;
}

export interface PersistOutcome {
  /** New interpreters (profile, roster entry and rates). */
  created: number;
  /** People already on the roster that had blanks filled in. Nothing already set is overwritten. */
  filledExisting: number;
  /** People already on the roster who had nothing left to fill. */
  unchangedExisting: number;
  /** People whose email already belongs to an interpreter who is not on this agency's roster: left alone. */
  skippedNotOnRoster: number;
}

export interface SamplePerson {
  name: string;
  city: string | null;
  email: string | null;
  certification: string | null;
  stateRate: string | null;
  kingCountyRate: string | null;
  nonStateRate: string | null;
}

export interface ImportReport {
  stateRows: number;
  nonStateRows: number;
  matched: number;
  onlyInState: number;
  onlyInNonState: number;
  people: number;
  withoutEmail: number;
  withCertification: number;
  outcome: PersistOutcome;
  unmatchedState: string[];
  unmatchedNonState: string[];
  notes: ImportNote[];
  notesTotal: number;
  sample: SamplePerson[];
}

export type ImportWorkbookResult =
  | { success: true; mode: "preview" | "import"; report: ImportReport }
  | { success: false; error: string };
