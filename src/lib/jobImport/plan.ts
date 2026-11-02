import { extractJobRows } from "@/lib/jobImport/jobSheet";
import { matchInterpreterName, matchKey } from "@/lib/jobImport/match";
import type { NameMatch, RosterCandidate } from "@/lib/jobImport/match";
import { JOBS_SHEET, MAX_POSITIONS } from "@/lib/jobImport/types";
import type { JobRow, JobsReport, PlannedJob, SampleJob } from "@/lib/jobImport/types";
import type { SheetGrid } from "@/lib/workbookImport/sheets";
import type { ImportNote } from "@/lib/workbookImport/types";

/**
 * Everything decided before the database is touched: scrub the rows, split the interpreter cells and look every
 * name up on the roster. Pure: the roster is passed in. SERVER ONLY (the sheet reader uses Node's crypto).
 */

export const MAX_REPORTED_NOTES = 40;
const MAX_LIST = 40;
const SAMPLE_SIZE = 8;

export type JobsPlan = { ok: true; jobs: PlannedJob[]; report: Omit<JobsReport, "outcome"> } | { ok: false; error: string };

const isAssigned = (kind: string): boolean => kind === "exact" || kind === "partial";

const toSample = (job: PlannedJob): SampleJob => ({
  line: job.line,
  date: job.date,
  startTime: job.startTime,
  endTime: job.endTime,
  startsAt: job.startsAt,
  endsAt: job.endsAt,
  raw: job.interpreterText,
  names: job.assignments.map((a) => ({
    name: a.name,
    result: a.match.kind,
    ...(isAssigned(a.match.kind) ? { matchedTo: (a.match as { label: string }).label } : {}),
  })),
});

/** Looks each named interpreter up; the same person twice in one job is kept once; the app holds two positions per job. */
const planOne = (row: JobRow, lookup: (name: string) => NameMatch, notes: ImportNote[]): PlannedJob => {
  const seenPeople = new Set<string>();
  const assignments: PlannedJob["assignments"] = [];
  for (const name of row.names) {
    const match = lookup(name);
    if (isAssigned(match.kind)) {
      const id = (match as { interpreterId: string }).interpreterId;
      if (seenPeople.has(id)) continue;
      seenPeople.add(id);
    }
    assignments.push({ name, match });
  }
  if (assignments.length > MAX_POSITIONS) {
    notes.push({ where: `${JOBS_SHEET}, row ${row.line}`, message: `Lists ${assignments.length} interpreters; a job holds ${MAX_POSITIONS}, so only the first ${MAX_POSITIONS} are assigned.` });
  }
  return { ...row, assignments: assignments.slice(0, MAX_POSITIONS) };
};

export const planJobs = (grid: SheetGrid, roster: readonly RosterCandidate[], allowPartial: boolean): JobsPlan => {
  const sheet = extractJobRows(grid);
  if (!sheet.ok) return { ok: false, error: sheet.error };
  const { rows, rowsRead, rowsSkipped, unusedColumns } = sheet.value;

  const notes: ImportNote[] = [...sheet.value.notes];
  // The same few hundred names recur across a thousand jobs: each distinct name is looked up once.
  const cache = new Map<string, NameMatch>();
  const lookup = (name: string): NameMatch => {
    const key = matchKey(name);
    const known = cache.get(key);
    if (known) return known;
    const found = matchInterpreterName(name, roster, allowPartial);
    cache.set(key, found);
    return found;
  };
  const jobs = rows.map((row) => planOne(row, lookup, notes));

  const names = { total: 0, exact: 0, partial: 0, ambiguous: 0, unmatched: 0 };
  const partial = new Map<string, { name: string; matchedTo: string; jobs: number }>();
  const unmatched = new Map<string, { name: string; jobs: number; reason: "none" | "ambiguous" }>();
  for (const job of jobs) {
    for (const { name, match } of job.assignments) {
      names.total += 1;
      if (match.kind === "exact") names.exact += 1;
      else if (match.kind === "partial") {
        names.partial += 1;
        const key = `${matchKey(name)}>${match.label}`;
        partial.set(key, { name, matchedTo: match.label, jobs: (partial.get(key)?.jobs ?? 0) + 1 });
      } else {
        if (match.kind === "ambiguous") names.ambiguous += 1;
        else names.unmatched += 1;
        const key = matchKey(name);
        const reason = match.kind === "ambiguous" ? "ambiguous" : "none";
        unmatched.set(key, { name, reason, jobs: (unmatched.get(key)?.jobs ?? 0) + 1 });
      }
    }
  }
  const byJobs = <T extends { jobs: number }>(list: Iterable<T>): T[] => Array.from(list).sort((a, b) => b.jobs - a.jobs).slice(0, MAX_LIST);
  const dates = jobs.map((job) => job.date).sort();

  return {
    ok: true,
    jobs,
    report: {
      rowsRead,
      rowsSkipped,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      jobsWithSeveralNames: jobs.filter((job) => job.assignments.length >= 2).length,
      names,
      partialMatches: byJobs(partial.values()),
      unmatched: byJobs(unmatched.values()),
      unusedColumns: unusedColumns.slice(0, 30),
      notes: notes.slice(0, MAX_REPORTED_NOTES),
      notesTotal: notes.length,
      sample: jobs.slice(0, SAMPLE_SIZE).map(toSample),
      multiSample: jobs.filter((job) => job.assignments.length >= 2).slice(0, SAMPLE_SIZE).map(toSample),
    },
  };
};
