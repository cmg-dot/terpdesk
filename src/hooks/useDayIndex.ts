"use client";

import { useMemo } from "react";
import { buildDayIndex, dayPhases, scheduleRequests } from "@/lib/calendarDayIndex";
import type { CalendarRequest, DayCard, DayIndex, DayPhases } from "@/lib/calendarDayIndex";

/** Each request's day and times, worked out once when the requests arrive (shared by the day index and the search). */
export const useScheduledCards = (requests: readonly CalendarRequest[]): DayCard[] => useMemo(() => scheduleRequests(requests), [requests]);

/**
 * The calendar's day lookup: a Map from yyyy-MM-dd to that day's sorted cards, so month / week / day read one key
 * instead of scanning every request per cell. The date work happens once when the requests arrive, the filter only
 * regroups. The minute clock is not a dependency (except for the "Happening now" filter, which is about the clock).
 */
export const useDayIndex = (cards: readonly DayCard[], statusFilter: string, nowMs: number): DayIndex => {
  const clock = statusFilter === "Happening now" ? nowMs : 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `clock` is `nowMs` only for the one clock-dependent filter
  return useMemo(() => buildDayIndex(cards, statusFilter, nowMs), [cards, statusFilter, clock]);
};

/** The live / finished / upcoming letters for each given day, refreshed on the clock without touching the index. */
export const useDayPhases = (dayKeys: readonly (string | null)[], index: DayIndex, nowMs: number): ReadonlyMap<string, DayPhases> => {
  const signature = dayKeys.join(",");
  return useMemo(() => {
    const phases = new Map<string, DayPhases>();
    for (const key of dayKeys) {
      const cards: readonly DayCard[] | undefined = key ? index.get(key) : undefined;
      if (key && cards) phases.set(key, dayPhases(cards, nowMs));
    }
    return phases;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands for `dayKeys`
  }, [signature, index, nowMs]);
};
