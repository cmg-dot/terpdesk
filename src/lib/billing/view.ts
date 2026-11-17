import { formatInTimeZone } from "date-fns-tz";
import { BUSINESS_ZONE } from "@/lib/billing/businessCalendar";
import { attentionItems, invoiceGroups, ledgerTotals, payrollGroups } from "@/lib/billing/ledger";
import type { AttentionItem, InvoiceGroup, LedgerTotals, PayrollGroup } from "@/lib/billing/ledger";
import { loadLedgers } from "@/lib/billing/load";
import { defaultPeriod, pickerPeriods, resolvePeriod } from "@/lib/billing/payPeriods";
import type { PayPeriod } from "@/lib/billing/payPeriods";
import { loadBillingSetup } from "@/lib/billing/store";
import type { Holiday } from "@/lib/billing/holidays";
import type { BillingSettings, JobLedger } from "@/lib/billing/types";

/** Everything one /billing view (or its CSV export) shows for a pay period. SERVER ONLY. */

export type BillingView =
  | { ready: false }
  | {
      ready: true;
      settings: BillingSettings;
      holidays: Holiday[];
      savedPeriods: PayPeriod[];
      periods: PayPeriod[];
      period: PayPeriod;
      ledgers: JobLedger[];
      payroll: PayrollGroup[];
      invoices: InvoiceGroup[];
      attention: AttentionItem[];
      totals: LedgerTotals;
    };

export async function loadBillingView(agencyId: string, periodId: string | undefined, now: Date = new Date()): Promise<BillingView> {
  const setup = await loadBillingSetup(agencyId);
  if (!setup.ready) return { ready: false };
  const today = formatInTimeZone(now, BUSINESS_ZONE, "yyyy-MM-dd");
  const period = resolvePeriod(periodId, setup.periods) ?? defaultPeriod(today, setup.periods);
  const ledgers = await loadLedgers(agencyId, period, setup.settings, setup.holidays);
  return {
    ready: true,
    settings: setup.settings,
    holidays: setup.holidays,
    savedPeriods: setup.periods,
    periods: pickerPeriods(today, setup.periods),
    period,
    ledgers,
    payroll: payrollGroups(ledgers),
    invoices: invoiceGroups(ledgers),
    attention: attentionItems(ledgers),
    totals: ledgerTotals(ledgers),
  };
}
