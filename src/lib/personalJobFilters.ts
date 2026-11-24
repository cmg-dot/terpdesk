import { FILTER_SETTINGS } from "@/lib/requestOptions";
import { ALL_SETTINGS } from "@/lib/websiteRequestView";
import type { MileageRange } from "@/lib/mileageSummary";
import type { PersonalJobView } from "@/lib/personalJobs";

/**
 * What the My work list can be narrowed and ordered by: Upcoming or Completed, a search over the label and setting, one setting,
 * and the sort. Pure (the browser narrows its own copy of the jobs, and the CSV export applies the same rules on the server).
 */

export type JobTab = "all" | "upcoming" | "completed";
export type JobSort = "newest" | "oldest" | "hours" | "miles";

export interface PersonalJobFilters {
  tab: JobTab;
  query: string;
  setting: string;
  sort: JobSort;
}

export const JOB_TABS: readonly JobTab[] = ["all", "upcoming", "completed"];
export const JOB_TAB_LABELS: Record<JobTab, string> = { all: "All", upcoming: "Upcoming", completed: "Completed" };
export const JOB_SORTS: readonly JobSort[] = ["newest", "oldest", "hours", "miles"];
export const JOB_SORT_LABELS: Record<JobSort, string> = { newest: "Newest first", oldest: "Oldest first", hours: "Most hours", miles: "Most miles" };
export const DEFAULT_JOB_FILTERS: PersonalJobFilters = { tab: "all", query: "", setting: ALL_SETTINGS, sort: "newest" };
export const MAX_JOB_QUERY = 100;

export type JobTabCounts = Record<JobTab, number>;

const sameText = (a: string, b: string): boolean => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
const startMs = (job: PersonalJobView): number => new Date(job.startsAt).getTime() || 0;

/** A job that has not ended yet (the one in progress counts as upcoming, not completed). */
export const isUpcoming = (job: PersonalJobView, nowMs: number): boolean => new Date(job.endsAt).getTime() > nowMs;

const inTab = (job: PersonalJobView, tab: JobTab, nowMs: number): boolean => tab === "all" || (tab === "upcoming" ? isUpcoming(job, nowMs) : !isUpcoming(job, nowMs));

/** True when every word typed appears in the label or the setting, ignoring case. */
export function matchesJobQuery(job: PersonalJobView, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${job.label} ${job.setting}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

const byStartDesc = (a: PersonalJobView, b: PersonalJobView): number => startMs(b) - startMs(a) || a.id.localeCompare(b.id);

const SORTERS: Record<JobSort, (a: PersonalJobView, b: PersonalJobView) => number> = {
  newest: byStartDesc,
  oldest: (a, b) => startMs(a) - startMs(b) || a.id.localeCompare(b.id),
  hours: (a, b) => b.workedMinutes - a.workedMinutes || byStartDesc(a, b),
  // A job with no miles entered sorts after every job that has some.
  miles: (a, b) => (b.countedMiles ?? -1) - (a.countedMiles ?? -1) || byStartDesc(a, b),
};

/** The jobs that pass the tab, setting and search, in the chosen order. `jobs` is normally already limited to the date range. */
export function applyPersonalJobFilters(jobs: readonly PersonalJobView[], filters: PersonalJobFilters, nowMs: number): PersonalJobView[] {
  return jobs
    .filter((job) => inTab(job, filters.tab, nowMs))
    .filter((job) => filters.setting === ALL_SETTINGS || sameText(job.setting, filters.setting))
    .filter((job) => matchesJobQuery(job, filters.query))
    .sort(SORTERS[filters.sort]);
}

export function personalJobTabCounts(jobs: readonly PersonalJobView[], nowMs: number): JobTabCounts {
  const upcoming = jobs.filter((job) => isUpcoming(job, nowMs)).length;
  return { all: jobs.length, upcoming, completed: jobs.length - upcoming };
}

/** "All settings", then the system's settings, then any other setting a job carries. */
export function personalJobSettingOptions(jobs: readonly PersonalJobView[]): string[] {
  const extras = Array.from(new Set(jobs.map((job) => job.setting).filter(Boolean))).filter((value) => !FILTER_SETTINGS.some((choice) => sameText(choice, value)));
  return [ALL_SETTINGS, ...FILTER_SETTINGS, ...extras.sort((a, b) => a.localeCompare(b))];
}

export const hasActiveJobFilters = (filters: PersonalJobFilters): boolean =>
  filters.query.trim() !== "" || filters.setting !== ALL_SETTINGS || filters.sort !== DEFAULT_JOB_FILTERS.sort;

/** The query string the CSV link carries, so the download is the list as it is shown (range, tab, search, setting). */
export function exportQuery(range: MileageRange, filters: PersonalJobFilters): string {
  const search = new URLSearchParams({ range });
  if (filters.tab !== "all") search.set("tab", filters.tab);
  if (filters.query.trim()) search.set("q", filters.query.trim().slice(0, MAX_JOB_QUERY));
  if (filters.setting !== ALL_SETTINGS) search.set("setting", filters.setting);
  return search.toString();
}

/** What the export route reads from the address. Anything missing or unknown falls back to "everything" (range all, tab all). */
export function parseExportQuery(params: URLSearchParams): { range: MileageRange; filters: PersonalJobFilters } {
  const range = params.get("range");
  const tab = params.get("tab");
  return {
    range: range === "30" || range === "90" ? range : "all",
    filters: {
      tab: JOB_TABS.find((candidate) => candidate === tab) ?? "all",
      query: (params.get("q") ?? "").slice(0, MAX_JOB_QUERY),
      setting: (params.get("setting") ?? "").slice(0, 80) || ALL_SETTINGS,
      sort: "newest",
    },
  };
}
