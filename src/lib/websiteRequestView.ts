import type { WebsiteRequestRow } from "@/lib/websiteRequests";

/**
 * How the Website requests board reads and orders its rows: urgency, waiting time, tabs, search, sort and the filters kept in the page
 * address. Pure functions of the rows and a clock (`now`, in ms), so they are tested without a browser or a database. The rows carry no
 * contact details, so nothing here can leak any.
 */

export const URGENT_HOURS = 48;
export const SOON_DAYS = 7;
export const ALL_SETTINGS = "All settings";
export const ALL_FORMATS = "All formats";

export type StatusTab = "needs_review" | "handled" | "all";
export type SortKey = "soonest" | "received" | "waiting";
/** urgent: starts within 48 hours. soon: within 7 days. passed: still unreviewed after its start. none: everything else. */
export type Urgency = "urgent" | "soon" | "passed" | "none";

export const STATUS_TABS: readonly StatusTab[] = ["needs_review", "handled", "all"];
export const TAB_LABELS: Record<StatusTab, string> = { needs_review: "Needs review", handled: "Handled", all: "All" };
export const SORT_KEYS: readonly SortKey[] = ["soonest", "received", "waiting"];
export const SORT_LABELS: Record<SortKey, string> = { soonest: "Soonest appointment", received: "Newest received", waiting: "Longest waiting" };

export interface WebsiteFilters {
  tab: StatusTab;
  query: string;
  setting: string;
  format: string;
  sort: SortKey;
}

export const DEFAULT_FILTERS: WebsiteFilters = { tab: "needs_review", query: "", setting: ALL_SETTINGS, format: ALL_FORMATS, sort: "soonest" };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const instant = (iso: string | null): number | null => {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
};

export function urgencyOf(row: WebsiteRequestRow, now: number): Urgency {
  const start = instant(row.startsAt);
  if (!row.needsReview || start === null) return "none";
  if (start <= now) return "passed";
  if (start - now <= URGENT_HOURS * HOUR) return "urgent";
  return start - now <= SOON_DAYS * DAY ? "soon" : "none";
}

/** Whole minutes an unreviewed request has waited since it was submitted; null for a handled one or one with no recorded time. */
export function waitingMinutes(row: WebsiteRequestRow, now: number): number | null {
  const received = instant(row.receivedAt);
  if (!row.needsReview || received === null) return null;
  return Math.max(0, Math.floor((now - received) / MINUTE));
}

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** "Just received", "Waiting 25m", "Waiting 3h", "Waiting 2d". */
export function waitingLabel(minutes: number): string {
  if (minutes < 1) return "Just received";
  if (minutes < 60) return `Waiting ${minutes}m`;
  if (minutes < 24 * 60) return `Waiting ${Math.floor(minutes / 60)}h`;
  return `Waiting ${Math.floor(minutes / (24 * 60))}d`;
}

/** "Starts in 45 min", "Starts in 5 hours", "Starts in 3 days"; "Start time has passed" for an unreviewed request that began. Handled: null. */
export function startsInLabel(row: WebsiteRequestRow, now: number): string | null {
  const start = instant(row.startsAt);
  if (!row.needsReview || start === null) return null;
  const ahead = start - now;
  if (ahead <= 0) return "Start time has passed";
  if (ahead < HOUR) return `Starts in ${Math.max(1, Math.round(ahead / MINUTE))} min`;
  if (ahead < DAY) return `Starts in ${plural(Math.floor(ahead / HOUR), "hour")}`;
  return `Starts in ${plural(Math.floor(ahead / DAY), "day")}`;
}

const normalize = (text: string): string => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Every word typed must be found in the organization, requester, setting, location or APT reference (so "clinic apt-ab12" works). */
export function matchesQuery(row: WebsiteRequestRow, query: string): boolean {
  const words = normalize(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize([row.organization, row.requesterName, row.setting, row.location, row.reference].filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

export const inTab = (row: WebsiteRequestRow, tab: StatusTab): boolean => tab === "all" || (tab === "needs_review" ? row.needsReview : !row.needsReview);

/** Upcoming first (soonest at the top), then the ones already past (most recent first), then those with no start time. */
const soonestKey = (row: WebsiteRequestRow, now: number): [number, number] => {
  const start = instant(row.startsAt);
  if (start === null) return [2, 0];
  return start > now ? [0, start] : [1, -start];
};

const compareBy = (key: SortKey, now: number) => (a: WebsiteRequestRow, b: WebsiteRequestRow): number => {
  let order = 0;
  if (key === "soonest") {
    const [ga, va] = soonestKey(a, now);
    const [gb, vb] = soonestKey(b, now);
    order = ga - gb || va - vb;
  } else if (key === "received") {
    order = (instant(b.receivedAt) ?? -Infinity) - (instant(a.receivedAt) ?? -Infinity);
    if (Number.isNaN(order)) order = 0;
  } else {
    const wa = waitingMinutes(a, now);
    const wb = waitingMinutes(b, now);
    order = wa === null && wb === null ? 0 : wa === null ? 1 : wb === null ? -1 : wb - wa;
  }
  return order || a.id.localeCompare(b.id);
};

/** The rows the board shows: the tab, the setting and format choices, the search words, then the sort. Never changes the input. */
export function applyFilters(rows: readonly WebsiteRequestRow[], filters: WebsiteFilters, now: number): WebsiteRequestRow[] {
  return rows
    .filter((row) => inTab(row, filters.tab))
    .filter((row) => filters.setting === ALL_SETTINGS || row.setting === filters.setting)
    .filter((row) => filters.format === ALL_FORMATS || row.format === filters.format)
    .filter((row) => matchesQuery(row, filters.query))
    .sort(compareBy(filters.sort, now));
}

export interface TabCounts {
  needs_review: number;
  handled: number;
  all: number;
}

export function tabCounts(rows: readonly WebsiteRequestRow[]): TabCounts {
  const needsReview = rows.filter((row) => row.needsReview).length;
  return { needs_review: needsReview, handled: rows.length - needsReview, all: rows.length };
}

export interface BoardStats {
  needsReview: number;
  /** Unreviewed requests that start within 48 hours. */
  startingSoon: number;
  longestWaitingMinutes: number | null;
}

export function boardStats(rows: readonly WebsiteRequestRow[], now: number): BoardStats {
  const waits = rows.map((row) => waitingMinutes(row, now)).filter((minutes): minutes is number => minutes !== null);
  return {
    needsReview: rows.filter((row) => row.needsReview).length,
    startingSoon: rows.filter((row) => urgencyOf(row, now) === "urgent").length,
    longestWaitingMinutes: waits.length > 0 ? Math.max(...waits) : null,
  };
}

/** The setting and format choices that exist in the data, behind an "All ..." entry. */
export function filterOptions(rows: readonly WebsiteRequestRow[]): { settings: string[]; formats: string[] } {
  const unique = (values: string[]): string[] => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  return { settings: [ALL_SETTINGS, ...unique(rows.map((row) => row.setting))], formats: [ALL_FORMATS, ...unique(rows.map((row) => row.format))] };
}

/** True when anything other than the tab has been changed (what "Clear filters" undoes). */
export const hasActiveFilters = (filters: WebsiteFilters): boolean =>
  filters.query.trim() !== "" || filters.setting !== ALL_SETTINGS || filters.format !== ALL_FORMATS || filters.sort !== DEFAULT_FILTERS.sort;

type Params = Record<string, string | string[] | undefined>;
const MAX_QUERY = 100;
const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? "" : value ?? "");

/** The filters named in the page address (`?tab=handled&q=clinic`); anything missing or unknown is the default. */
export function parseFilters(params: Params): WebsiteFilters {
  const tab = first(params.tab);
  const sort = first(params.sort);
  return {
    tab: STATUS_TABS.find((value) => value === tab) ?? DEFAULT_FILTERS.tab,
    sort: SORT_KEYS.find((value) => value === sort) ?? DEFAULT_FILTERS.sort,
    query: first(params.q).slice(0, MAX_QUERY),
    setting: first(params.setting).slice(0, MAX_QUERY) || ALL_SETTINGS,
    format: first(params.format).slice(0, MAX_QUERY) || ALL_FORMATS,
  };
}

/** The address query for these filters; anything still at its default is left out ("" for the default view). */
export function filtersToQuery(filters: WebsiteFilters): string {
  const search = new URLSearchParams();
  if (filters.tab !== DEFAULT_FILTERS.tab) search.set("tab", filters.tab);
  if (filters.sort !== DEFAULT_FILTERS.sort) search.set("sort", filters.sort);
  if (filters.query.trim()) search.set("q", filters.query.trim());
  if (filters.setting !== ALL_SETTINGS) search.set("setting", filters.setting);
  if (filters.format !== ALL_FORMATS) search.set("format", filters.format);
  return search.toString();
}
