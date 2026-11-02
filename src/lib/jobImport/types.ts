import type { ImportNote } from "@/lib/workbookImport/types";
import type { NameMatch } from "@/lib/jobImport/match";

/** Shared shapes for the historical-jobs import. Pure types and constants: safe to import from client components. */

export const JOBS_SHEET = "Jobs";
export const MAX_JOB_ROWS = 5_000;
/** The sheet carries no time zone, so every job is read as agency-local time (the same zone the request form defaults to). */
export const JOBS_TIME_ZONE_LABEL = "Pacific Time — Seattle, Los Angeles";
export const JOBS_IANA_ZONE = "America/Los_Angeles";
/** The app supports at most two interpreters (positions) per job. */
export const MAX_POSITIONS = 2;

/** One usable row of the Jobs sheet, after scrubbing. */
export interface JobRow {
  line: number;
  /** Local calendar date and times as read: yyyy-MM-dd and HH:mm. */
  date: string;
  startTime: string;
  endTime: string;
  /** Strict UTC ISO timestamps. */
  startsAt: string;
  endsAt: string;
  /** The interpreter cell as written (null when empty). */
  interpreterText: string | null;
  /** The people named in it, in order. */
  names: string[];
  /** A fingerprint of every cell in the row, so re-importing the file never creates a job twice. */
  contentHash: string;
}

/** A job row with every named interpreter looked up on the roster. */
export interface PlannedJob extends JobRow {
  assignments: { name: string; match: NameMatch }[];
}

export interface SampleJob {
  line: number;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  raw: string | null;
  names: { name: string; result: NameMatch["kind"]; matchedTo?: string }[];
}

export interface JobsOutcome {
  /** Jobs added (each with its interpreter assignments). */
  created: number;
  /** Interpreter assignments created across those jobs. */
  assignments: number;
  /** Rows whose job already exists from an earlier import: left alone. */
  alreadyImported: number;
}

export interface JobsReport {
  rowsRead: number;
  /** Rows dropped because a date or time could not be read (each is listed in the notes). */
  rowsSkipped: number;
  /** Earliest and latest job date (yyyy-MM-dd), null when there are none. */
  firstDate: string | null;
  lastDate: string | null;
  jobsWithSeveralNames: number;
  names: { total: number; exact: number; partial: number; ambiguous: number; unmatched: number };
  /** Distinct partial-name matches, so a wrong one is easy to spot: "Karen" -> "Karen Ames" (14 jobs). */
  partialMatches: { name: string; matchedTo: string; jobs: number }[];
  /** Names that matched nobody (or more than one person), with how many jobs they appear in. */
  unmatched: { name: string; jobs: number; reason: "none" | "ambiguous" }[];
  outcome: JobsOutcome;
  /** Columns in the sheet that this import does not use. */
  unusedColumns: string[];
  notes: ImportNote[];
  notesTotal: number;
  sample: SampleJob[];
  multiSample: SampleJob[];
}

export type ImportJobsResult =
  | { success: true; mode: "preview" | "import"; report: JobsReport }
  | { success: false; error: string };
