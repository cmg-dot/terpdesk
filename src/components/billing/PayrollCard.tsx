"use client";

import Link from "next/link";
import { FeeBadge, OutcomeBadge, PayerBadge, payerSummary } from "@/components/billing/CategoryBadge";
import { LineTable } from "@/components/billing/LineTable";
import { MoneyPill } from "@/components/billing/Money";
import { Expandable } from "@/components/ui/Expandable";
import { dayLabel } from "@/lib/billing/format";
import type { PayrollGroup } from "@/lib/billing/ledger";

/**
 * One interpreter's pay for the period. Folded, it is a single scannable row: name, how many jobs and for whom ("State 2 · HCA 1"),
 * and the emerald total; opened, every job with its date, reference, place, payer and lines, each with its own total. No PHI.
 */
export function PayrollCard({ group, open, onOpenChange }: { group: PayrollGroup; open: boolean; onOpenChange: (open: boolean) => void }) {
  const jobs = group.rows.length;
  const commercialAuto = group.rows.some((r) => r.lines.some((l) => l.kind === "commercial_auto"));
  return (
    <Expandable
      name="payroll-card"
      open={open}
      onOpenChange={onOpenChange}
      className="rounded-2xl border border-gray-200 bg-white"
      bodyClassName="divide-y divide-gray-100 border-t border-gray-100"
      header={
        <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-payroll-interpreter={group.interpreterName}>
          <span className="min-w-0">
            <span className="block font-semibold text-[var(--ink)]">{group.interpreterName}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-[var(--sage)]">
              <span>
                {jobs} job{jobs === 1 ? "" : "s"} · {payerSummary(group.rows.map((r) => r.category))}
              </span>
              {commercialAuto && <FeeBadge kind="commercial_auto" />}
            </span>
          </span>
          <MoneyPill cents={group.totalCents} className="text-base" />
        </span>
      }
    >
      {group.rows.map((r) => (
        <div key={`${r.requestId}-${r.positionId}`} className="space-y-2 px-5 py-4" data-payroll-row={r.reference}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="w-24 shrink-0 font-medium tabular-nums text-[var(--ink)]">{dayLabel(r.serviceDate)}</span>
            <Link href={`/requests/${r.requestId}`} className="-my-3 inline-block py-3 font-medium text-[var(--accent-text)] hover:underline">
              {r.reference}
            </Link>
            <span className="text-[var(--sage)]">· {r.placeLabel}</span>
            <PayerBadge category={r.category} />
            <OutcomeBadge outcome={r.outcome} />
          </div>
          <div className="sm:pl-[6.5rem]">
            <LineTable lines={r.lines} total={r.totalCents} totalLabel="Job total" />
          </div>
        </div>
      ))}
    </Expandable>
  );
}
