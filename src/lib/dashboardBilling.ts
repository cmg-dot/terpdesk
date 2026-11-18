import { defaultPeriod } from "@/lib/billing/payPeriods";
import type { PayPeriod } from "@/lib/billing/payPeriods";

/**
 * What the dashboard's billing card shows: the pay period /billing opens on (the latest one that has ended) with its invoice cutoff and
 * pay date. Dates only: no amounts, no names, nothing about any job. Pure and client-safe.
 */
export interface DashboardBilling {
  /** The period's id, so the card can open /billing on exactly it. */
  periodId: string;
  /** yyyy-MM-dd, inclusive. */
  start: string;
  end: string;
  /** ISO instant of the invoice cutoff, or null when none is saved for the period. */
  cutoffAt: string | null;
  /** True once the cutoff has passed (false when there is none). */
  cutoffPassed: boolean;
  /** yyyy-MM-dd, or null. */
  payDate: string | null;
}

/** The card's facts from the saved pay periods, the agency's date today (yyyy-MM-dd) and the current instant. */
export function dashboardBillingOf(saved: readonly PayPeriod[], today: string, nowMs: number): DashboardBilling {
  const period = defaultPeriod(today, saved);
  const cutoffMs = period.cutoffAt ? new Date(period.cutoffAt).getTime() : Number.NaN;
  return {
    periodId: period.id,
    start: period.start,
    end: period.end,
    cutoffAt: period.cutoffAt,
    cutoffPassed: !Number.isNaN(cutoffMs) && cutoffMs <= nowMs,
    payDate: period.payDate,
  };
}
