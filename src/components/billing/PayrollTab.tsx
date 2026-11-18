"use client";

import { useState } from "react";
import { AttentionList } from "@/components/billing/AttentionList";
import { ExportLink } from "@/components/billing/ExportLink";
import { PayrollCard } from "@/components/billing/PayrollCard";
import type { AttentionItem, PayrollGroup } from "@/lib/billing/ledger";

/**
 * Interpreter payroll for the pay period: one folded card per interpreter (name, jobs, payers, total), so the whole period reads at a
 * glance; "Expand all" opens every breakdown at once. Never shows a client's name or any other PHI.
 */
export function PayrollTab({ groups, attention, periodId }: { groups: PayrollGroup[]; attention: AttentionItem[]; periodId: string }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.interpreterId));
  const setOne = (id: string, next: boolean) =>
    setOpen((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });

  return (
    <section className="space-y-4" aria-label="Interpreter payroll">
      <AttentionList items={attention} />
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-[var(--sage)]">No approved hours or billable cancellations in this pay period yet.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--sage)]">
              {groups.length} interpreter{groups.length === 1 ? "" : "s"} paid this period
            </p>
            <button
              type="button"
              onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.interpreterId)))}
              className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-[var(--accent-text)] transition-colors hover:border-[rgb(var(--forest-rgb)/0.4)] hover:bg-[var(--mint)] max-sm:min-h-11"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          </div>
          <div className="space-y-3">
            {groups.map((g) => (
              <PayrollCard key={g.interpreterId} group={g} open={open.has(g.interpreterId)} onOpenChange={(next) => setOne(g.interpreterId, next)} />
            ))}
          </div>
          <div className="flex justify-end">
            <ExportLink kind="payroll" periodId={periodId} label="Download payroll CSV (QuickBooks / Excel)" />
          </div>
        </>
      )}
    </section>
  );
}
