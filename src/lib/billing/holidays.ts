import { addDays, isoDate, isoWeekday, lastDayOfMonth } from "@/lib/billing/calendarDays";

/**
 * Washington State legal holidays (RCW 1.16.050) as they are observed: one on a Saturday is taken the Friday before, one on a Sunday
 * the Monday after. Used to seed the holiday list (0013_billing.sql) and to suggest a year's list on Rates & rules. Pure.
 */

export interface Holiday {
  date: string;
  label: string;
}

/** The `n`th given weekday (1 = Monday) of a month; n = -1 for the last. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = isoDate(year, month, 1);
    const offset = (weekday - isoWeekday(first) + 7) % 7;
    return addDays(first, offset + (n - 1) * 7);
  }
  const last = isoDate(year, month, lastDayOfMonth(year, month));
  return addDays(last, -((isoWeekday(last) - weekday + 7) % 7));
}

/** A fixed-date holiday moved off the weekend. */
function observed(date: string, label: string): Holiday {
  const weekday = isoWeekday(date);
  if (weekday === 6) return { date: addDays(date, -1), label: `${label} (observed)` };
  if (weekday === 7) return { date: addDays(date, 1), label: `${label} (observed)` };
  return { date, label };
}

/** Every observed WA state holiday that falls in `year` (next year's New Year's Day can land on this year's Dec 31). */
export function waStateHolidays(year: number): Holiday[] {
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const list: Holiday[] = [
    observed(isoDate(year, 1, 1), "New Year's Day"),
    { date: nthWeekday(year, 1, 1, 3), label: "Martin Luther King Jr. Day" },
    { date: nthWeekday(year, 2, 1, 3), label: "Presidents' Day" },
    { date: nthWeekday(year, 5, 1, -1), label: "Memorial Day" },
    observed(isoDate(year, 6, 19), "Juneteenth"),
    observed(isoDate(year, 7, 4), "Independence Day"),
    { date: nthWeekday(year, 9, 1, 1), label: "Labor Day" },
    observed(isoDate(year, 11, 11), "Veterans Day"),
    { date: thanksgiving, label: "Thanksgiving Day" },
    { date: addDays(thanksgiving, 1), label: "Native American Heritage Day" },
    observed(isoDate(year, 12, 25), "Christmas Day"),
    observed(isoDate(year + 1, 1, 1), "New Year's Day"),
  ];
  const prefix = `${year}-`;
  return list.filter((h) => h.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));
}
