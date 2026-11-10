import { formatDateInZone, getIanaZone } from "@/utils/timezone";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

/**
 * Hours review's search and filters. Pure functions, so the page, the toolbar and the tests share one set of rules. The filters
 * live in the URL (?q=&status=&range=&sig=&page=), and a value equal to its default is left out so a plain page has a plain URL.
 */

export type StatusFilter = "awaiting" | "correction" | "approved" | "cancelled" | "all";
export type RangeFilter = "any" | "today" | "7d" | "30d";
export type SignatureFilter = "any" | "missing";

export interface HoursFilters {
  /** Free text: SRN (with or without #), interpreter name, title. */
  q: string;
  status: StatusFilter;
  range: RangeFilter;
  sig: SignatureFilter;
}

/** What the page shows on first load: reports awaiting review, no search, any date, any signature. */
export const DEFAULT_FILTERS: HoursFilters = { q: "", status: "awaiting", range: "any", sig: "any" };

const STATUS_VALUES: readonly StatusFilter[] = ["awaiting", "correction", "approved", "cancelled", "all"];
const RANGE_VALUES: readonly RangeFilter[] = ["any", "today", "7d", "30d"];
const SIGNATURE_VALUES: readonly SignatureFilter[] = ["any", "missing"];

/** The days a range reaches back, counting today (so "7d" is today and the six days before it). */
const RANGE_DAYS: Record<Exclude<RangeFilter, "any">, number> = { today: 1, "7d": 7, "30d": 30 };

const oneOf = <T extends string>(allowed: readonly T[], value: string | null, fallback: T): T =>
  allowed.find((candidate) => candidate === value) ?? fallback;

/** Anything with `get`, so the browser's URLSearchParams and Next's ReadonlyURLSearchParams both fit. */
export interface ParamSource {
  get: (name: string) => string | null;
}

/** The filters in a URL. Unknown or missing values fall back to the defaults, so a hand-edited URL never breaks the page. */
export function parseFilters(params: ParamSource): HoursFilters {
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    status: oneOf(STATUS_VALUES, params.get("status"), DEFAULT_FILTERS.status),
    range: oneOf(RANGE_VALUES, params.get("range"), DEFAULT_FILTERS.range),
    sig: oneOf(SIGNATURE_VALUES, params.get("sig"), DEFAULT_FILTERS.sig),
  };
}

/** The requested page (1 when missing, not a number, or below 1). Clamping to the last page is the list's job. */
export const parsePage = (params: ParamSource): number => Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

/**
 * The URL for a page of the list with these filters. Every active filter is kept; defaults and page 1 are left out. Changing a
 * filter links to page 1 of the new result, so pass 1.
 */
export function hrefForPage(filters: HoursFilters, page: number, pathname = ""): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== DEFAULT_FILTERS.status) params.set("status", filters.status);
  if (filters.range !== DEFAULT_FILTERS.range) params.set("range", filters.range);
  if (filters.sig !== DEFAULT_FILTERS.sig) params.set("sig", filters.sig);
  if (page > 1) params.set("page", String(Math.floor(page)));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname || "?";
}

/** How many filters differ from the defaults (what "Clear filters" would undo). */
export const countActiveFilters = (filters: HoursFilters): number =>
  [filters.q !== "", filters.status !== DEFAULT_FILTERS.status, filters.range !== "any", filters.sig !== "any"].filter(Boolean).length;

// ---- search

/** Lower case, "#" dropped (so "#202786433" and "202786433" are the same) and spacing collapsed. */
const normalize = (text: string): string => text.toLowerCase().replace(/#/g, "").replace(/\s+/g, " ").trim();

/** True when every word typed appears in at least one of the fields, in any order. A blank search matches everything. */
export function matchesSearch(query: string, ...fields: ReadonlyArray<string | null | undefined>): boolean {
  const words = normalize(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(fields.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

// ---- status, date, signature

export type RecordStatus = "awaiting" | "correction" | "approved" | "closed" | "other";

/** The record bucket each status filter shows ("all" shows every record). */
const FILTER_BUCKET: Record<Exclude<StatusFilter, "all">, RecordStatus> = { awaiting: "awaiting", correction: "correction", approved: "approved", cancelled: "closed" };

/**
 * Which filter bucket a record belongs to ("other" = a draft or not started: only "All" shows it). A record on a voided, returned or
 * cancelled job is "closed" whatever its hours say, so it leaves the queues and shows only under "Cancelled / voided" and "All".
 */
export function recordStatus(record: Pick<ServiceRecord, "state" | "jobClosed">): RecordStatus {
  if (record.jobClosed) return "closed";
  if (record.state === "submitted" || record.state === "awaiting_review") return "awaiting";
  if (record.state === "changes_requested" || record.state === "correction_requested") return "correction";
  if (record.state === "approved") return "approved";
  return "other";
}

const DAY_MS = 86_400_000;
const dayNumber = (isoDay: string): number => {
  const [year, month, day] = isoDay.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
};

/** True when the appointment's calendar day, in its own time zone, falls within the range ending today (today in that same zone). */
export function inRange(record: Pick<ServiceRecord, "scheduledStart" | "timeZone">, range: RangeFilter, now: Date): boolean {
  if (range === "any") return true;
  const zone = getIanaZone(record.timeZone);
  const day = formatDateInZone(record.scheduledStart, zone, "yyyy-MM-dd");
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day)) return false;
  const today = formatDateInZone(now, zone, "yyyy-MM-dd");
  const daysAgo = dayNumber(today) - dayNumber(day);
  return daysAgo >= 0 && daysAgo < RANGE_DAYS[range];
}

export type FilterableRecord = Pick<ServiceRecord, "state" | "jobClosed" | "reference" | "title" | "interpreterName" | "scheduledStart" | "timeZone" | "signatureDataUrl">;

/** The records that pass every active filter, in their original order. `now` is passed in so the result is testable. */
export function filterRecords<T extends FilterableRecord>(records: readonly T[], filters: HoursFilters, now: Date = new Date()): T[] {
  return records.filter((record) => {
    if (filters.status !== "all" && recordStatus(record) !== FILTER_BUCKET[filters.status]) return false;
    if (filters.sig === "missing" && record.signatureDataUrl) return false;
    if (!inRange(record, filters.range, now)) return false;
    return matchesSearch(filters.q, record.reference, record.title, record.interpreterName);
  });
}

/** How many records are in each status bucket, for the Status dropdown's counts. */
export function statusCounts(records: ReadonlyArray<Pick<ServiceRecord, "state" | "jobClosed">>): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { awaiting: 0, correction: 0, approved: 0, cancelled: 0, all: records.length };
  for (const record of records) {
    const status = recordStatus(record);
    if (status === "closed") counts.cancelled += 1;
    else if (status !== "other") counts[status] += 1;
  }
  return counts;
}
