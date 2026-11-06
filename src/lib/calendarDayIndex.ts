import type { fetchLiveRequests } from "@/app/actions/getRequests";
import { agencyDateKey } from "@/lib/agencyTime";
import { isCancelledRequest, matchesStatusFilter } from "@/lib/requestListFilter";
import type { ListedRequest } from "@/lib/requestListFilter";
import { isAppointmentHappeningNow, isAppointmentPast } from "@/utils/happeningNow";
import { resolveRequestTimes } from "@/utils/timezone";

/** A request as the agency calendar receives it. */
export type CalendarRequest = Awaited<ReturnType<typeof fetchLiveRequests>>[number];

/** The mapped rows from fetchLiveRequests are what the list filter was written for (the Requests page hands them over the same way). */
const listed = (request: CalendarRequest): ListedRequest => request as unknown as ListedRequest;

/** One appointment on the calendar, its schedule worked out once (not once per cell, per render). */
export interface DayCard {
  request: CalendarRequest;
  /** The agency-zone day it falls on, yyyy-MM-dd. */
  dayKey: string;
  startsAt: string;
  endsAt: string | undefined;
  startMs: number;
  cancelled: boolean;
}

/** Every day with appointments, each day's cards in start order. A day with none is simply absent. */
export type DayIndex = ReadonlyMap<string, readonly DayCard[]>;

/** One letter per card: L live now, P finished, U upcoming. */
export type DayPhases = string;

export const NO_CARDS: readonly DayCard[] = [];

/** The schedule of a request, or null when it has no start time (such a request is not on the calendar). */
const scheduleOf = (request: CalendarRequest): DayCard | null => {
  const data = request.data as { startsAt?: string; details?: { startDate?: string; startTime?: string } } | null | undefined;
  const hasStart = Boolean(request.startsAt || data?.startsAt || (data?.details?.startDate && data?.details?.startTime));
  if (!hasStart) return null;
  const { startsAt, endsAt } = resolveRequestTimes(request);
  if (!startsAt) return null;
  try {
    return { request, dayKey: agencyDateKey(startsAt), startsAt, endsAt, startMs: new Date(startsAt).getTime() || 0, cancelled: isCancelledRequest(listed(request)) };
  } catch {
    return null;
  }
};

/** Step one: each request's day and times. Costs one date-zone conversion per request, so it runs only when the data changes. */
export const scheduleRequests = (requests: readonly CalendarRequest[]): DayCard[] =>
  requests.flatMap((request) => {
    const card = scheduleOf(request);
    return card ? [card] : [];
  });

/**
 * Step two: the cards the status filter lets through, grouped by day and sorted by start time (ties keep list order).
 * `nowMs` only matters to the "Happening now" filter; every other filter ignores the clock.
 */
export const buildDayIndex = (cards: readonly DayCard[], statusFilter: string, nowMs: number): DayIndex => {
  const byDay = new Map<string, DayCard[]>();
  for (const card of cards) {
    if (!matchesStatusFilter(listed(card.request), statusFilter, nowMs)) continue;
    const day = byDay.get(card.dayKey);
    if (day) day.push(card);
    else byDay.set(card.dayKey, [card]);
  }
  byDay.forEach((day) => day.sort((a, b) => a.startMs - b.startMs));
  return byDay;
};

/** Live / finished / upcoming for each card of a day, at `nowMs`. Cheap: it only looks at the cards of one visible day. */
export const dayPhases = (cards: readonly DayCard[], nowMs: number): DayPhases =>
  cards
    .map(({ request, cancelled }) => {
      const live = !cancelled && isAppointmentHappeningNow(request, nowMs);
      return live ? "L" : isAppointmentPast(request, nowMs) ? "P" : "U";
    })
    .join("");

/** The cards of a day with the live ones first (the order the grid has always used), each paired with its phase. */
export const orderForDisplay = (cards: readonly DayCard[], phases: DayPhases): { card: DayCard; phase: string }[] => {
  const paired = cards.map((card, i) => ({ card, phase: phases[i] ?? "U" }));
  return [...paired.filter((p) => p.phase === "L"), ...paired.filter((p) => p.phase !== "L")];
};
