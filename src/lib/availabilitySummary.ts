import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** A span within one day, in minutes after local midnight (0-1440). */
export interface DaySpan {
  start: number;
  end: number;
}

export interface DayAvailability {
  /** yyyy-MM-dd in the interpreter's time zone. */
  date: string;
  /** e.g. "Mon, Nov 3". */
  label: string;
  /** Working hours left after commitments. */
  free: DaySpan[];
  /** Private busy time: shown without any title. */
  busy: DaySpan[];
  /** Jobs the interpreter accepted from this agency. */
  booked: (DaySpan & { requestId: string })[];
  /** The interpreter marked the whole day as unavailable. */
  dayOff: boolean;
  /** Time zone abbreviation for that day in the interpreter's zone, e.g. "PDT" or "PST" (changes with DST). */
  tzAbbr: string;
  /** Real length of the local day (1380 or 1500 on DST change days, otherwise 1440). */
  minutesInDay: number;
}

export interface AvailabilityInputs {
  timeZone: string;
  rules: { weekday: number; startMinute: number; endMinute: number }[];
  exceptions: { onDate: string; available: boolean; startMinute: number | null; endMinute: number | null }[];
  busy: { startsAt: Date; endsAt: Date }[];
  booked: { requestId: string; startsAt: Date; endsAt: Date }[];
}

const DAY = 1440;

const merge = (spans: DaySpan[]): DaySpan[] => {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: DaySpan[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
};

const subtract = (windows: DaySpan[], taken: DaySpan[]): DaySpan[] =>
  taken.reduce(
    (free, t) =>
      free.flatMap((w) => {
        if (t.end <= w.start || t.start >= w.end) return [w];
        return [
          ...(t.start > w.start ? [{ start: w.start, end: t.start }] : []),
          ...(t.end < w.end ? [{ start: t.end, end: w.end }] : []),
        ];
      }),
    windows,
  );

/** The part of [startsAt, endsAt) that falls on the local day starting at dayStart, as minutes. */
const clipToDay = (startsAt: Date, endsAt: Date, dayStart: Date, dayEnd: Date): DaySpan | null => {
  const s = Math.max(startsAt.getTime(), dayStart.getTime());
  const e = Math.min(endsAt.getTime(), dayEnd.getTime());
  if (e <= s) return null;
  return { start: Math.round((s - dayStart.getTime()) / 60000), end: Math.round((e - dayStart.getTime()) / 60000) };
};

/**
 * Day-by-day summary for the next `days` days in the interpreter's time zone. Same reading of rules and exceptions
 * as the availability engine: weekday from the local date (0 = Sunday); an unavailable exception blocks the day;
 * an available exception with times replaces that day's hours, and without times opens the whole day.
 */
export function summarizeAvailability(input: AvailabilityInputs, now: Date, days = 14): DayAvailability[] {
  const zone = input.timeZone;
  const today = formatInTimeZone(now, zone, "yyyy-MM-dd");
  const result: DayAvailability[] = [];

  for (let i = 0; i < days; i++) {
    const anchor = new Date(`${today}T12:00:00.000Z`);
    anchor.setUTCDate(anchor.getUTCDate() + i);
    const date = anchor.toISOString().slice(0, 10);
    const weekday = anchor.getUTCDay();
    const dayStart = fromZonedTime(`${date}T00:00:00`, zone);
    const next = new Date(anchor);
    next.setUTCDate(next.getUTCDate() + 1);
    const dayEnd = fromZonedTime(`${next.toISOString().slice(0, 10)}T00:00:00`, zone);

    const exception = input.exceptions.find((e) => e.onDate === date);
    let windows: DaySpan[];
    if (exception) {
      windows = !exception.available
        ? []
        : exception.startMinute != null && exception.endMinute != null
          ? [{ start: exception.startMinute, end: exception.endMinute }]
          : [{ start: 0, end: DAY }];
    } else {
      windows = input.rules.filter((r) => r.weekday === weekday).map((r) => ({ start: r.startMinute, end: r.endMinute }));
    }

    const busy = merge(input.busy.map((b) => clipToDay(b.startsAt, b.endsAt, dayStart, dayEnd)).filter((s): s is DaySpan => s !== null));
    const booked = input.booked
      .map((b) => {
        const span = clipToDay(b.startsAt, b.endsAt, dayStart, dayEnd);
        return span ? { ...span, requestId: b.requestId } : null;
      })
      .filter((s): s is DaySpan & { requestId: string } => s !== null)
      .sort((a, b) => a.start - b.start);

    // Time already past today is not free any more.
    const pastToday = i === 0 ? [{ start: 0, end: Math.ceil((now.getTime() - dayStart.getTime()) / 60000) }] : [];
    const free = subtract(merge(windows), merge([...busy, ...booked, ...pastToday]));

    result.push({
      date,
      label: formatInTimeZone(dayStart, zone, "EEE, MMM d"),
      free,
      busy,
      booked,
      dayOff: Boolean(exception && !exception.available),
      // Taken at midday, so a DST switch at 2 AM still yields that day's prevailing abbreviation.
      tzAbbr: formatInTimeZone(new Date(dayStart.getTime() + 12 * 3_600_000), zone, "zzz"),
      minutesInDay: Math.round((dayEnd.getTime() - dayStart.getTime()) / 60000),
    });
  }
  return result;
}

/**
 * A span as shown to agencies, in the interpreter's zone: "12:30 PM – 5:00 PM (PDT)", or "All day" when it covers
 * the whole local day (midnight to midnight).
 */
export const formatSpan = (span: DaySpan, day: Pick<DayAvailability, "tzAbbr" | "minutesInDay">): string => {
  if (span.start <= 0 && span.end >= Math.min(DAY, day.minutesInDay)) return "All day";
  return `${formatMinute(span.start)} – ${formatMinute(span.end)} (${day.tzAbbr})`;
};

/** 540 -> "9:00 AM"; 1440 -> "midnight". */
export const formatMinute = (minute: number): string => {
  if (minute >= DAY) return "midnight";
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${period}`;
};
