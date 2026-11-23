import { formatInTimeZone } from "date-fns-tz";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";

/**
 * What the interpreter's calendar draws, and the text on it (moved out of the calendar page unchanged). Pure.
 */

export interface CalendarAppointment {
  id: string;
  requestId?: string;
  start: Date;
  end: Date;
  startsAt: string;
  endsAt: string;
  title: string;
  agencyName: string;
  timeZone?: string;
  status?: string;
  raw?: unknown;
}

export interface CalendarBusyBlock {
  id: string;
  label: string;
  timeZone: string;
  isAllDay: boolean;
  start: string;
  end: string;
}

/** A job as the interpreter's job list (or the copy this browser keeps) describes it. Every field may be missing. */
export interface CalendarJobSource {
  id: string | number;
  requestId?: string;
  status?: string;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  agencyName?: string;
  location?: string;
  timeZone?: string;
  details?: { startDate?: string; startTime?: string; endDate?: string; endTime?: string; timeZone?: string } | null;
}

/** An ISO time for a loose date value (a date, a "2026-12-01 09:00" string, a timestamp), or null when it is not a date. */
export const parseSafeIso = (dateVal: string | number | Date | null | undefined): string | null => {
  if (!dateVal) return null;
  let d = new Date(dateVal);
  if (!isNaN(d.getTime())) return d.toISOString();
  if (typeof dateVal === "string") {
    d = new Date(dateVal.replace(" ", "T"));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
};

/** The jobs the interpreter has booked, as calendar entries. Test jobs ("fictional") are left out. */
export function bookedAppointments(sourceList: readonly CalendarJobSource[]): CalendarAppointment[] {
  return sourceList
    .filter((j) => {
      const status = String(j.status || "").toLowerCase();
      return (status === "booked" || status === "accepted") && !String(j.id).includes("fictional") && !(j.title || "").includes("Fictional");
    })
    .map((j) => {
      const startsAt = j.startsAt || parseSafeIso(j.details?.startDate ? `${j.details.startDate}T${j.details.startTime || "00:00"}` : null) || new Date().toISOString();
      let endsAt = j.endsAt || parseSafeIso(j.details?.endDate ? `${j.details.endDate}T${j.details.endTime || "00:00"}` : null);
      if (!endsAt) {
        endsAt = new Date(new Date(startsAt).getTime() + 3600000).toISOString();
      }
      return {
        id: String(j.id),
        requestId: j.requestId || String(j.id),
        start: new Date(startsAt),
        end: new Date(endsAt),
        startsAt,
        endsAt,
        title: j.title || "Interpreting request",
        agencyName: j.agencyName || j.location || "QA Fixture Agency",
        timeZone: j.timeZone || j.details?.timeZone,
        status: j.status,
        raw: j,
      };
    });
}

/** "9:00 AM – 10:00 AM PST" in the zone the calendar is showing. */
export const formatEventTimes = (zone: string, startsAt: string | Date, endsAt: string | Date): string => {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  return `${formatInTimeZone(s, zone, "h:mm a")} – ${formatInTimeZone(e, zone, "h:mm a zzz")}`;
};

/** A busy block's times, or "All day · PST" for one that runs from midnight to midnight. */
export const formatBusyBlockTimes = (zone: string, block: CalendarBusyBlock): string => {
  const s = new Date(block.start);
  const e = new Date(block.end);
  const startH = parseInt(formatInTimeZone(s, zone, "H"), 10);
  const startM = parseInt(formatInTimeZone(s, zone, "m"), 10);
  const endH = parseInt(formatInTimeZone(e, zone, "H"), 10);
  const endM = parseInt(formatInTimeZone(e, zone, "m"), 10);
  const isAllDay = block.isAllDay || (startH === 0 && startM === 0 && endH === 0 && endM === 0);
  const tzAbbr = formatInTimeZone(s, zone, "zzz");
  if (isAllDay) return `All day · ${tzAbbr}`;
  return `${formatInTimeZone(s, zone, "h:mm a")} – ${formatInTimeZone(e, zone, "h:mm a zzz")}`;
};

/** Appointments for the calendar day `dateKey` (yyyy-MM-dd) in `zone`. */
export const appointmentsOnDay = (appointments: readonly CalendarAppointment[], zone: string, dateKey: string): CalendarAppointment[] =>
  appointments.filter((a) => formatInTimeZone(new Date(a.startsAt), zone, "yyyy-MM-dd") === dateKey);

/** Busy blocks that start on the calendar day `dateKey` (yyyy-MM-dd) in `zone`. */
export const busyBlocksOnDay = (blocks: readonly CalendarBusyBlock[], zone: string, dateKey: string): CalendarBusyBlock[] =>
  blocks.filter((b) => formatInTimeZone(new Date(b.start), zone, "yyyy-MM-dd") === dateKey);

/** What is happening now first, then by start time. */
export const sortLiveFirst = (appointments: readonly CalendarAppointment[], nowMs: number): CalendarAppointment[] =>
  [...appointments].sort((a, b) => {
    const aHappening = isAppointmentHappeningNow(a, nowMs);
    const bHappening = isAppointmentHappeningNow(b, nowMs);
    if (aHappening && !bHappening) return -1;
    if (!aHappening && bHappening) return 1;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });
