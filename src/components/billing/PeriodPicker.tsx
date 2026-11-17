"use client";

import { useRouter } from "next/navigation";
import { periodLabel } from "@/lib/billing/format";

export interface PeriodOption {
  id: string;
  start: string;
  end: string;
  saved: boolean;
}

/** The pay period the page shows. Changing it keeps the tab and reloads the ledgers for the new dates. */
export function PeriodPicker({ periods, selected, tab }: { periods: PeriodOption[]; selected: string; tab: string }) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-[var(--sage)]">
      Pay period
      <select
        value={selected}
        onChange={(e) => router.push(`/billing?tab=${tab}&period=${encodeURIComponent(e.target.value)}`)}
        className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--forest)]"
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {periodLabel(p)}
            {p.saved ? "" : " (standard)"}
          </option>
        ))}
      </select>
    </label>
  );
}
