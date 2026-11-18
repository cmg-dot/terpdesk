import Link from "next/link";
import { PeriodPicker } from "@/components/billing/PeriodPicker";
import type { PeriodOption } from "@/components/billing/PeriodPicker";
import { cutoffLabel, dayLabel } from "@/lib/billing/format";
import { Total } from "@/components/billing/Money";
import type { LedgerTotals } from "@/lib/billing/ledger";
import type { PayPeriod } from "@/lib/billing/payPeriods";

export const BILLING_TABS = [
  { id: "payroll", label: "Interpreter payroll" },
  { id: "invoices", label: "Invoicing" },
  { id: "rules", label: "Rates & rules" },
] as const;
export type BillingTab = (typeof BILLING_TABS)[number]["id"];

export const parseTab = (value: string | undefined): BillingTab => BILLING_TABS.find((t) => t.id === value)?.id ?? "payroll";

/** A summary tile: money tiles carry an emerald total and a soft emerald edge; a count stays neutral. */
const Tile = ({ label, cents, count, note, className = "" }: { label: string; cents?: number; count?: number; note?: string; className?: string }) => (
  <div className={`rounded-2xl border bg-white px-4 py-3 sm:px-5 sm:py-4 ${cents !== undefined ? "money-tile border-emerald-200" : "border-gray-200"} ${className}`} data-billing-tile={label}>
    <div className="text-xs font-medium uppercase tracking-wide text-[var(--sage)]">{label}</div>
    <div className="mt-1">{cents !== undefined ? <Total cents={cents} size="xl" /> : <span className="text-2xl font-semibold tabular-nums text-[var(--ink)]">{count}</span>}</div>
    {note && <div className="mt-0.5 text-xs text-[var(--sage)]">{note}</div>}
  </div>
);

/** The pay period's due and pay dates, each whole on its own line on a phone (never broken mid-time), side by side from sm up. */
const Schedule = ({ period }: { period: PayPeriod }) => {
  if (!period.saved) return <p className="mt-1 text-sm text-[var(--sage)]">Standard half-month: no cutoff or pay date saved for it yet (Rates & rules &gt; Pay schedule).</p>;
  if (!period.cutoffAt && !period.payDate) return null;
  return (
    <p className="mt-1 flex flex-col gap-0.5 text-sm text-[var(--sage)] sm:flex-row sm:flex-wrap sm:gap-x-2">
      {period.cutoffAt && <span className="whitespace-nowrap">Invoices due {cutoffLabel(period.cutoffAt)}</span>}
      {period.cutoffAt && period.payDate && (
        <span aria-hidden="true" className="hidden sm:inline">
          ·
        </span>
      )}
      {period.payDate && <span className="whitespace-nowrap">Paid {dayLabel(period.payDate)}</span>}
    </p>
  );
};

/** Title, the period's due and pay dates (the picker beside it names the period), its totals and the three tabs. */
export function BillingHeader({ tab, period, periods, totals }: { tab: BillingTab; period: PayPeriod; periods: PeriodOption[]; totals: LedgerTotals }) {
  return (
    <header className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-[var(--ink)]">Billing</h1>
          <Schedule period={period} />
        </div>
        <PeriodPicker periods={periods} selected={period.id} tab={tab} />
      </div>
      {tab !== "rules" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Interpreter pay" cents={totals.payCents} note={`${totals.interpreters} interpreter${totals.interpreters === 1 ? "" : "s"}`} />
          <Tile label="To invoice" cents={totals.billCents} note="State, HCA and organizations" />
          <Tile label="Jobs" count={totals.jobs} note="with approved hours or a billable outcome" className="col-span-2 sm:col-span-1" />
        </div>
      )}
      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200" aria-label="Billing sections">
        {BILLING_TABS.map((t) => (
          <Link
            key={t.id}
            href={`/billing?tab=${t.id}&period=${encodeURIComponent(period.id)}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4 ${t.id === tab ? "border-[var(--forest)] text-[var(--accent-text)]" : "border-transparent text-[var(--sage)] hover:text-[var(--ink)]"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
