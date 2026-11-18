import { addDays } from "@/lib/billing/calendarDays";
import { wallClockToUtc } from "@/utils/timezone";

/**
 * Travel time on a state job (ODHH or Apple Health) as the state's service verification reports it: up to two windows, there and
 * back ("Travel Start Time / Travel End Time" twice). A timesheet row has room for one window, so the full list of each timesheet's
 * windows is kept on its request, staff-only: `requests.data.travelWindows[timesheetId]` (written by stateJobHours.ts). Billing pays
 * the minutes in them (unless staff approved a different number) and splits evening minutes; Hours review shows them. Pure.
 */

export interface TravelWindow {
  /** ISO instants. */
  start: string;
  end: string;
}

/** A leg as written on the form: a wall-clock time, with its own date when the form gives one. */
export interface WallClockLeg {
  startDate: string | null;
  /** 24-hour "HH:mm". */
  startTime: string;
  endDate: string | null;
  endTime: string;
}

export const MAX_TRAVEL_WINDOWS = 4;
/** One leg longer than this is a typo, not travel. */
export const MAX_LEG_MINUTES = 12 * 60;

export const windowMinutes = (w: TravelWindow): number => Math.round((Date.parse(w.end) - Date.parse(w.start)) / 60000);

export const totalTravelMinutes = (windows: readonly TravelWindow[]): number => windows.reduce((n, w) => n + Math.max(0, windowMinutes(w)), 0);

export function isTravelWindow(value: unknown): value is TravelWindow {
  const w = value as Partial<TravelWindow> | null;
  if (!w || typeof w.start !== "string" || typeof w.end !== "string") return false;
  const minutes = windowMinutes(w as TravelWindow);
  return Number.isFinite(minutes) && minutes > 0 && minutes <= MAX_LEG_MINUTES;
}

/** The travel windows recorded for one timesheet on a request's data; null when none were recorded for it. */
export function readTravelWindows(requestData: unknown, timesheetId: string | null | undefined): TravelWindow[] | null {
  if (!timesheetId || !requestData || typeof requestData !== "object") return null;
  const map = (requestData as { travelWindows?: unknown }).travelWindows;
  if (!map || typeof map !== "object" || Array.isArray(map)) return null;
  const list = (map as Record<string, unknown>)[timesheetId];
  if (!Array.isArray(list)) return null;
  const windows = list.filter(isTravelWindow).slice(0, MAX_TRAVEL_WINDOWS);
  return windows.length > 0 ? windows : null;
}

/**
 * Wall-clock legs as instants in the job's zone. A leg with no date of its own takes `defaultDate` (the service day); one that ends
 * at or before its start is taken to end the next day. Legs that still read wrong (missing times, longer than 12 hours) are dropped.
 */
export function windowsFromWallClock(legs: readonly WallClockLeg[], defaultDate: string, zone: string): TravelWindow[] {
  const out: TravelWindow[] = [];
  for (const leg of legs.slice(0, MAX_TRAVEL_WINDOWS)) {
    if (!/^\d{2}:\d{2}$/.test(leg.startTime) || !/^\d{2}:\d{2}$/.test(leg.endTime)) continue;
    const startDate = leg.startDate ?? defaultDate;
    let endDate = leg.endDate ?? startDate;
    if (!leg.endDate && leg.endTime <= leg.startTime) endDate = addDays(startDate, 1);
    try {
      const window = { start: wallClockToUtc(`${startDate}T${leg.startTime}:00`, zone), end: wallClockToUtc(`${endDate}T${leg.endTime}:00`, zone) };
      if (isTravelWindow(window)) out.push(window);
    } catch {
      // An unreadable date (it throws): the leg is dropped like any other that reads wrong.
    }
  }
  return out;
}
