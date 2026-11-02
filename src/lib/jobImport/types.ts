import type { ImportNote } from "@/lib/workbookImport/types";
import type { NameMatch } from "@/lib/jobImport/match";

/** Shared shapes for the historical-jobs import. Pure types and constants: safe to import from client components. */

/** Any sheet whose name contains "job" (capitals ignored), e.g. "Jobs 10302026- 12312027". */
export const JOBS_SHEET_PATTERN = /job/i;
export const JOBS_SHEET_LABEL = "Job";
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
  /** The time range cell as text (a date Excel made from "10-3" is turned back into "10-3"). */
  timeRange: string;
  /** Column 2 as written (null when empty), and column 7, the consumer (never shown in reports or logs). */
  location: string | null;
  consumer: string | null;
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
  timeRange: string;
  location: string | null;
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
  /** The sheet that was read, and any other sheet whose name also contains "job" (those are NOT read). */
  sheetName: string;
  otherJobSheets: string[];
  withLocation: number;
  /** Rows that name a consumer. The names themselves are stored on the job but never echoed here. */
  withConsumer: number;
  notes: ImportNote[];
  notesTotal: number;
  sample: SampleJob[];
  multiSample: SampleJob[];
}

export type ImportJobsResult =
  | { success: true; mode: "preview" | "import"; report: JobsReport }
  | { success: false; error: string };
