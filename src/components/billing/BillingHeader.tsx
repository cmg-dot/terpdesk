import Link from "next/link";
import { PeriodPicker } from "@/components/billing/PeriodPicker";
import type { PeriodOption } from "@/components/billing/PeriodPicker";
import { cutoffLabel, dayLabel, periodLabel } from "@/lib/billing/format";
import { formatCents } from "@/lib/billing/money";
import type { LedgerTotals } from "@/lib/billing/ledger";
import type { PayPeriod } from "@/lib/billing/payPeriods";

export const BILLING_TABS = [
  { id: "payroll", label: "Interpreter payroll" },
  { id: "invoices", label: "Invoicing" },
  { id: "rules", label: "Rates & rules" },
] as const;
export type BillingTab = (typeof BILLING_TABS)[number]["id"];

export const parseTab = (value: string | undefined): BillingTab => BILLING_TABS.find((t) => t.id === value)?.id ?? "payroll";

const Tile = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
    <div className="text-xs font-medium uppercase tracking-wide text-[var(--sage)]">{label}</div>
    <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--ink)]">{value}</div>
    {note && <div className="mt-0.5 text-xs text-[var(--sage)]">{note}</div>}
  </div>
);

/** Title, pay period (with its cutoff and pay date), the period's totals and the three tabs. */
export function BillingHeader({ tab, period, periods, totals }: { tab: BillingTab; period: PayPeriod; periods: PeriodOption[]; totals: LedgerTotals }) {
  const schedule = period.saved
    ? [period.cutoffAt ? `Invoices due ${cutoffLabel(period.cutoffAt)}` : "", period.payDate ? `Paid ${dayLabel(period.payDate)}` : ""].filter(Boolean).join(" · ")
    : "Standard half-month: no cutoff or pay date saved for it yet (Rates & rules > Pay schedule).";
  return (
    <header className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--ink)]">Billing</h1>
          <p className="mt-1 text-sm text-[var(--sage)]">
            {periodLabel(period)}
            {schedule && <span> · {schedule}</span>}
          </p>
        </div>
        <PeriodPicker periods={periods} selected={period.id} tab={tab} />
      </div>
      {tab !== "rules" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile label="Interpreter pay" value={formatCents(totals.payCents)} note={`${totals.interpreters} interpreter${totals.interpreters === 1 ? "" : "s"}`} />
          <Tile label="To invoice" value={formatCents(totals.billCents)} note="State, HCA and organizations" />
          <Tile label="Jobs" value={String(totals.jobs)} note="with approved hours or a billable outcome" />
        </div>
      )}
      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200" aria-label="Billing sections">
        {BILLING_TABS.map((t) => (
          <Link
            key={t.id}
            href={`/billing?tab=${t.id}&period=${encodeURIComponent(period.id)}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${t.id === tab ? "border-[var(--forest)] text-[var(--forest)]" : "border-transparent text-[var(--sage)] hover:text-[var(--ink)]"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
