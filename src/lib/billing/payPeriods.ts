import { addDays, isoDate, lastDayOfMonth } from "@/lib/billing/calendarDays";

/**
 * Semi-monthly pay periods. The agency's own schedule (agency_pay_periods: service dates, the invoice cutoff at noon Pacific and the
 * pay date) is what counts; when none is saved for a date, the standard halves of the month (1st-15th, 16th-last day) stand in,
 * with no cutoff or pay date, and say so. Pure.
 */

export interface PayPeriod {
  /** The saved row's id, or "std:<start>" for a standard half-month that is not saved. */
  id: string;
  /** yyyy-MM-dd, inclusive. */
  start: string;
  end: string;
  /** ISO instant of the invoice cutoff, or null. */
  cutoffAt: string | null;
  /** yyyy-MM-dd, or null. */
  payDate: string | null;
  saved: boolean;
}

/** The two standard halves of a month. */
export function standardHalves(year: number, month: number): PayPeriod[] {
  const first = isoDate(year, month, 1);
  const mid = isoDate(year, month, 15);
  const second = isoDate(year, month, 16);
  const last = isoDate(year, month, lastDayOfMonth(year, month));
  return [
    { id: `std:${first}`, start: first, end: mid, cutoffAt: null, payDate: null, saved: false },
    { id: `std:${second}`, start: second, end: last, cutoffAt: null, payDate: null, saved: false },
  ];
}

const contains = (p: PayPeriod, date: string): boolean => p.start <= date && date <= p.end;

/** The saved period holding `date`, else the standard half-month holding it. */
export function periodFor(date: string, saved: readonly PayPeriod[]): PayPeriod {
  const own = saved.find((p) => contains(p, date));
  if (own) return own;
  const [y, m] = date.split("-").map(Number);
  return standardHalves(y, m).find((p) => contains(p, date)) ?? standardHalves(y, m)[0];
}

/** The period to open on: the most recent one that has ended (the one being invoiced and paid now). */
export const defaultPeriod = (today: string, saved: readonly PayPeriod[]): PayPeriod => periodFor(addDays(periodFor(today, saved).start, -1), saved);

/** The periods the picker offers: every saved one plus the standard halves around `today` that no saved period covers. */
export function pickerPeriods(today: string, saved: readonly PayPeriod[], monthsBack = 6, monthsAhead = 1): PayPeriod[] {
  const [y, m] = today.split("-").map(Number);
  const out = new Map<string, PayPeriod>();
  for (const p of saved) out.set(p.id, p);
  for (let k = -monthsBack; k <= monthsAhead; k += 1) {
    const at = new Date(Date.UTC(y, m - 1 + k, 1));
    for (const half of standardHalves(at.getUTCFullYear(), at.getUTCMonth() + 1)) {
      if (!saved.some((p) => p.start <= half.end && half.start <= p.end)) out.set(half.id, half);
    }
  }
  return Array.from(out.values()).sort((a, b) => b.start.localeCompare(a.start));
}

/** A period from the URL: a saved id, or "std:<start>" for a standard half. Null when it names nothing known. */
export function resolvePeriod(id: string | undefined, saved: readonly PayPeriod[]): PayPeriod | null {
  if (!id) return null;
  const own = saved.find((p) => p.id === id);
  if (own) return own;
  const m = /^std:(\d{4})-(\d{2})-(\d{2})$/.exec(id);
  if (!m) return null;
  const half = standardHalves(Number(m[1]), Number(m[2])).find((p) => p.id === id);
  return half ?? null;
}
