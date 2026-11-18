import Link from "next/link";
import { cutoffLabel, dayLabel, periodLabel } from "@/lib/billing/format";
import { IS_DEMO_MODE } from "@/lib/demoMode";
import type { DashboardBilling } from "@/lib/dashboardBilling";

interface Props {
  /** The period facts, or undefined while the first read is under way. */
  billing: DashboardBilling | undefined;
  failed: boolean;
  /** `counts.hoursAwaitingReview` from the dashboard summary, or null until that arrives. */
  hoursAwaitingReview: number | null;
}

const buttonClass = "inline-flex min-h-11 items-center rounded-full px-4 py-2.5 text-sm font-medium transition-opacity focus:outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.5)]";

/** The dashboard's right column when billing is on: the pay period Billing opens on, its dates, and what to do next. Dates only. */
export function BillingPeriodCard({ billing, failed, hoursAwaitingReview }: Props) {
  const hours =
    hoursAwaitingReview === null
      ? null
      : hoursAwaitingReview > 0
        ? hoursAwaitingReview === 1
          ? "1 set of hours is awaiting review. Approve it so it is paid and invoiced."
          : `${hoursAwaitingReview} sets of hours are awaiting review. Approve them so they are paid and invoiced.`
        : "No hours are waiting for review.";
  return (
    <section aria-labelledby="billing-period-heading" className="rounded-2xl border border-gray-200 bg-white p-6" data-dashboard-billing="">
      <h2 id="billing-period-heading" className="text-[17px] font-semibold text-[var(--ink)]">
        Billing period
      </h2>
      {failed && <p role="alert" className="mt-3 text-sm text-red-700">We could not load the pay period. It will be tried again when you return to this page.</p>}
      {!billing && !failed && <p className="mt-3 text-sm text-[var(--sage)]">Loading…</p>}
      {billing && (
        <>
          <p className="mt-1 text-[15px] font-medium tabular-nums text-[var(--ink)]">{periodLabel(billing)}</p>
          <dl className="mt-4 space-y-3 text-[14px]">
            <div>
              <dt className="text-[13px] text-[var(--sage)]">Invoices due</dt>
              <dd className="mt-0.5 text-[var(--ink)]">
                {billing.cutoffAt ? (
                  <>
                    {cutoffLabel(billing.cutoffAt)}
                    {billing.cutoffPassed && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Passed</span>}
                  </>
                ) : (
                  <Link href="/billing?tab=rules" className="-my-3 inline-block py-3 font-medium text-[var(--accent-text)] hover:underline">
                    No cutoff saved
                  </Link>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-[var(--sage)]">Pay date</dt>
              <dd className="mt-0.5 text-[var(--ink)]">{billing.payDate ? dayLabel(billing.payDate) : "Not saved"}</dd>
            </div>
          </dl>
          {hours && <p className="mt-4 rounded-xl bg-[var(--canvas)] px-4 py-3 text-[14px] leading-relaxed text-slate-700">{hours}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/hours-review" className={`${buttonClass} bg-[var(--forest)] text-white hover:opacity-90`}>
              Review hours
            </Link>
            <Link href={`/billing?period=${encodeURIComponent(billing.periodId)}`} className={`${buttonClass} border border-gray-200 bg-white text-slate-700 hover:bg-gray-50`}>
              Open billing
            </Link>
          </div>
        </>
      )}
      {IS_DEMO_MODE && (
        <p className="mt-5 border-t border-gray-100 pt-3 text-xs text-[var(--sage)]">
          Demo:{" "}
          <a href="/book" target="_blank" rel="noreferrer" className="font-medium text-slate-600 underline-offset-2 hover:underline">
            Public booking form
          </a>
        </p>
      )}
    </section>
  );
}
