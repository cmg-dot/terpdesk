"use client";

import { useState } from "react";
import { PayerBadge } from "@/components/billing/CategoryBadge";
import { InvoiceJob } from "@/components/billing/InvoiceJob";
import { MoneyPill } from "@/components/billing/Money";
import { Expandable } from "@/components/ui/Expandable";
import type { InvoiceGroup } from "@/lib/billing/ledger";
import type { BillingSettings } from "@/lib/billing/types";

const NOTE: Record<InvoiceGroup["category"], string> = {
  state: "Interpreter's State or King County rate · 1.5 hr minimum · +0.5 hr base · $75 vendor fee per interpreter",
  hca: "Entered in ProviderOne · 1.5 hr minimum · +0.5 hr base · $75 vendor fee per interpreter",
  non_state: "Organization's rate · 2 hr minimum, then rounded up · no vendor fee",
};

/**
 * One invoice: State (ODHH), Apple Health (ProviderOne) or an organization, open by default, with its payer badge and emerald total.
 * Its jobs are folded rows ("Show all" opens every one) that open to the overrides, the ProviderOne entry and the lines.
 */
export function InvoiceGroupCard({ group, settings }: { group: InvoiceGroup; settings: BillingSettings }) {
  const [openJobs, setOpenJobs] = useState<ReadonlySet<string>>(new Set());
  const allOpen = group.jobs.every((l) => openJobs.has(l.job.requestId));
  const setJob = (id: string, next: boolean) =>
    setOpenJobs((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });

  return (
    <Expandable
      name="invoice-group"
      defaultOpen
      className="rounded-2xl border border-gray-200 bg-white"
      bodyClassName="border-t border-gray-100"
      header={
        <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-invoice-group={group.label}>
          <span className="min-w-0 space-y-1">
            <span className="flex flex-wrap items-center gap-2">
              <PayerBadge category={group.category} />
              {group.category === "non_state" && <span className="font-semibold text-[var(--ink)]">{group.label}</span>}
            </span>
            <span className="block text-xs text-[var(--sage)]">
              {group.jobs.length} job{group.jobs.length === 1 ? "" : "s"} · {NOTE[group.category]}
            </span>
          </span>
          <MoneyPill cents={group.totalCents} className="text-base" />
        </span>
      }
    >
      <div className="flex justify-end px-5 pt-3">
        <button
          type="button"
          onClick={() => setOpenJobs(allOpen ? new Set() : new Set(group.jobs.map((l) => l.job.requestId)))}
          className="rounded-full px-3 py-1 text-xs font-medium text-[var(--forest)] hover:bg-[var(--mint)]"
        >
          {allOpen ? "Fold all jobs" : "Show all jobs"}
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {group.jobs.map((ledger) => (
          <InvoiceJob key={ledger.job.requestId} ledger={ledger} settings={settings} open={openJobs.has(ledger.job.requestId)} onOpenChange={(next) => setJob(ledger.job.requestId, next)} />
        ))}
      </div>
    </Expandable>
  );
}
