import type { DayCard } from "@/lib/calendarDayIndex";

/** One job as the calendar search sees it: what is shown in a result, plus one lowercase line to match against. */
export interface SearchEntry {
  id: string;
  srn: string | null;
  organization: string;
  venue: string;
  title: string;
  /** The agency-zone day, yyyy-MM-dd. */
  dayKey: string;
  startsAt: string;
  endsAt: string | undefined;
  startMs: number;
  cancelled: boolean;
  haystack: string;
}

/** Names of the interpreters booked on a job (the placeholder "Assigned" is not a name). */
const bookedNames = (card: DayCard): string[] => {
  const { request } = card;
  const names = [...(request.slots ?? []).map((slot) => slot.interpreterName), request.assignedInterpreterName];
  return Array.from(new Set(names.filter((name): name is string => typeof name === "string" && name !== "" && name !== "Assigned")));
};

/** Built once per data load (see useCalendarSearch), so each keystroke is a scan of short strings. */
export const buildSearchEntries = (cards: readonly DayCard[]): SearchEntry[] =>
  cards.map((card) => {
    const { request } = card;
    const { srn, where, where: { venue } } = request;
    const organization = request.organization ?? "";
    const title = request.title ?? "";
    const haystack = [srn ?? "", organization, where.text, title, ...bookedNames(card)].join(" | ").toLowerCase();
    return { id: request.id, srn, organization, venue, title, dayKey: card.dayKey, startsAt: card.startsAt, endsAt: card.endsAt, startMs: card.startMs, cancelled: card.cancelled, haystack };
  });

export const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;

/** "#202783304", "SRN 202783304" and "202783304" all mean the same thing. */
const cleanQuery = (raw: string): string => raw.trim().toLowerCase().replace(/^(srn\s*)?#?\s*/, "");

/** How well an entry matches: 0 is an exact SRN, then SRN starts-with, SRN contains, name starts-with, anywhere else. */
const rank = (entry: SearchEntry, query: string): number => {
  const srn = entry.srn ?? "";
  if (srn === query) return 0;
  if (srn.startsWith(query)) return 1;
  if (srn.includes(query)) return 2;
  if (entry.organization.toLowerCase().startsWith(query) || entry.title.toLowerCase().startsWith(query)) return 3;
  return 4;
};

/** Every word typed must appear somewhere in the job. Best matches first; then upcoming jobs, nearest first, before past ones. */
export const searchJobs = (entries: readonly SearchEntry[], raw: string, nowMs: number): SearchEntry[] => {
  const query = cleanQuery(raw);
  if (query.length < MIN_QUERY_LENGTH) return [];
  const words = query.split(/\s+/).filter(Boolean);
  const hits = entries.filter((entry) => words.every((word) => entry.haystack.includes(word)));
  const upcoming = (entry: SearchEntry): number => (entry.startMs >= nowMs ? 0 : 1);
  return hits
    .map((entry) => ({ entry, rank: rank(entry, query) }))
    .sort((a, b) => a.rank - b.rank || upcoming(a.entry) - upcoming(b.entry) || Math.abs(a.entry.startMs - nowMs) - Math.abs(b.entry.startMs - nowMs))
    .slice(0, MAX_RESULTS)
    .map((hit) => hit.entry);
};
