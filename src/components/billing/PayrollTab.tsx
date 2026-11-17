import Link from "next/link";
import { AttentionList } from "@/components/billing/AttentionList";
import { ExportLink } from "@/components/billing/ExportLink";
import { LineTable } from "@/components/billing/LineTable";
import { CATEGORY_LABEL } from "@/lib/billing/categories";
import { dayLabel } from "@/lib/billing/format";
import { OUTCOME_LABEL } from "@/lib/billing/ledger";
import type { AttentionItem, PayrollGroup } from "@/lib/billing/ledger";
import { formatCents } from "@/lib/billing/money";

/**
 * Interpreter payroll for the pay period: one card per interpreter (collapsed to name and total), each job itemised inside.
 * Never shows a client's name or any other PHI: a job is its reference, date, city and payer type.
 */
export function PayrollTab({ groups, attention, periodId }: { groups: PayrollGroup[]; attention: AttentionItem[]; periodId: string }) {
  return (
    <section className="space-y-4" aria-label="Interpreter payroll">
      <AttentionList items={attention} />
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-[var(--sage)]">No approved hours or billable cancellations in this pay period yet.</p>
      ) : (
        groups.map((g) => (
          <details key={g.interpreterId} className="group rounded-2xl border border-gray-200 bg-white" data-payroll-interpreter={g.interpreterName}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <span>
                <span className="font-semibold text-[var(--ink)]">{g.interpreterName}</span>
                <span className="ml-2 text-sm text-[var(--sage)]">
                  {g.rows.length} job{g.rows.length === 1 ? "" : "s"}
                </span>
              </span>
              <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">{formatCents(g.totalCents)}</span>
            </summary>
            <div className="space-y-4 border-t border-gray-100 px-5 py-4">
              {g.rows.map((r) => (
                <div key={`${r.requestId}-${r.positionId}`} className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium tabular-nums text-[var(--ink)]">{dayLabel(r.serviceDate)}</span>
                    <Link href={`/requests/${r.requestId}`} className="text-[var(--forest)] hover:underline">
                      {r.reference}
                    </Link>
                    <span className="text-[var(--sage)]">
                      · {r.placeLabel} · {CATEGORY_LABEL[r.category]}
                      {r.outcome === "completed" ? "" : ` · ${OUTCOME_LABEL[r.outcome]}`}
                    </span>
                  </div>
                  <LineTable lines={r.lines} total={r.totalCents} />
                </div>
              ))}
            </div>
          </details>
        ))
      )}
      {groups.length > 0 && (
        <div className="flex justify-end">
          <ExportLink kind="payroll" periodId={periodId} label="Download payroll CSV (QuickBooks / Excel)" />
        </div>
      )}
    </section>
  );
}
