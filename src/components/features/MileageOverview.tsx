"use client";

import { useMemo, useState } from "react";
import { MileageEntryCard } from "@/components/features/MileageEntryCard";
import { MILEAGE_RANGES, entriesInRange, mileageTotals } from "@/lib/mileageSummary";
import type { MileageEntry, MileageRange } from "@/lib/mileageSummary";

interface MileageOverviewProps {
  entries: MileageEntry[];
  /** When the entries were read (ISO); the 30 / 90 day windows end here, so the page renders the same on both sides. */
  generatedAt: string;
}

/** The two totals plus the per-job list, filtered by Last 30 days / Last 90 days / All time. */
export function MileageOverview({ entries, generatedAt }: MileageOverviewProps) {
  const [range, setRange] = useState<MileageRange>("30");
  const nowMs = useMemo(() => new Date(generatedAt).getTime(), [generatedAt]);
  const visible = useMemo(() => entriesInRange(entries, range, nowMs), [entries, range, nowMs]);
  const totals = useMemo(() => mileageTotals(visible), [visible]);

  return (
    <div className="space-y-6">
      <div role="group" aria-label="Date range" className="flex flex-wrap gap-2">
        {MILEAGE_RANGES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={range === option.value}
            onClick={() => setRange(option.value)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              range === option.value
                ? "border-[var(--forest)] bg-[var(--forest)] text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-[var(--sage)]">Reported for reimbursement</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-[var(--ink)]">{totals.reported.toFixed(1)} mi</p>
          <p className="mt-1 text-xs text-[var(--sage)]">{totals.jobs === 1 ? "1 job" : `${totals.jobs} jobs`}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-[var(--sage)]">Approved by agencies</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-[var(--ink)]">{totals.approved.toFixed(1)} mi</p>
          <p className="mt-1 text-xs text-[var(--sage)]">
            {totals.awaitingApproval === 0 ? "Everything reported is approved" : `${totals.awaitingApproval} not approved yet`}
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-[var(--sage)]">
          No mileage reported {range === "all" ? "yet" : "in this period"}. Mileage you add when you submit hours for a job appears here.
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((entry) => (
            <MileageEntryCard key={entry.requestId} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
