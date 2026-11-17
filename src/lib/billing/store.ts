import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agencyBillingSettings, agencyHolidays, agencyInterpreterBilling, agencyPayPeriods } from "@/db/billingSchema";
import { toCents } from "@/lib/billing/money";
import type { Holiday } from "@/lib/billing/holidays";
import type { PayPeriod } from "@/lib/billing/payPeriods";
import { settingsFromRow } from "@/lib/billing/settings";
import type { BillingSettings } from "@/lib/billing/types";

/**
 * Reads of the billing tables (0013_billing.sql). A database without them (production until the migration is applied) answers
 * "not ready" instead of failing, so /billing can say so. SERVER ONLY.
 */

export type BillingSetup =
  | { ready: true; settings: BillingSettings; holidays: Holiday[]; periods: PayPeriod[] }
  | { ready: false };

/** Postgres "undefined_table": the migration has not been applied to this database. */
export const isMissingTable = (error: unknown): boolean => {
  const own = (error as { code?: unknown } | null)?.code;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return own === "42P01" || cause === "42P01";
};

export async function loadBillingSetup(agencyId: string): Promise<BillingSetup> {
  try {
    const [row] = await db.select().from(agencyBillingSettings).where(eq(agencyBillingSettings.agencyId, agencyId)).limit(1);
    const holidays = await db
      .select({ date: agencyHolidays.holidayDate, label: agencyHolidays.label })
      .from(agencyHolidays)
      .where(eq(agencyHolidays.agencyId, agencyId))
      .orderBy(asc(agencyHolidays.holidayDate));
    const periods = await db.select().from(agencyPayPeriods).where(eq(agencyPayPeriods.agencyId, agencyId)).orderBy(asc(agencyPayPeriods.periodStart));
    return {
      ready: true,
      settings: settingsFromRow(row ?? null),
      holidays,
      periods: periods.map((p) => ({ id: p.id, start: p.periodStart, end: p.periodEnd, cutoffAt: p.cutoffAt?.toISOString() ?? null, payDate: p.payDate, saved: true })),
    };
  } catch (error) {
    if (isMissingTable(error)) return { ready: false };
    throw error;
  }
}

/** Interpreter id -> evening travel rate in cents, for the given interpreters (all of the agency's when `ids` is omitted). */
export async function loadEveningRates(agencyId: string, ids?: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids && ids.length === 0) return out;
  const where = ids
    ? and(eq(agencyInterpreterBilling.agencyId, agencyId), inArray(agencyInterpreterBilling.interpreterId, [...ids]))
    : eq(agencyInterpreterBilling.agencyId, agencyId);
  const rows = await db.select({ id: agencyInterpreterBilling.interpreterId, rate: agencyInterpreterBilling.eveningRate }).from(agencyInterpreterBilling).where(where);
  for (const r of rows) {
    const cents = toCents(r.rate);
    if (cents !== null) out.set(r.id, cents);
  }
  return out;
}
