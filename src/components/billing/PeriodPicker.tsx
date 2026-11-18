"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { Dropdown } from "@/components/ui/Dropdown";
import { BUSINESS_ZONE } from "@/lib/billing/businessCalendar";
import { periodLabel } from "@/lib/billing/format";
import type { DropdownOption } from "@/lib/dropdown";

export interface PeriodOption {
  id: string;
  start: string;
  end: string;
  cutoffAt: string | null;
  saved: boolean;
}

/** "Nov 1 – 15, 2026 · due Nov 20" (a saved period with its cutoff), or "… · standard" for a half-month nothing is saved for. */
const optionLabel = (p: PeriodOption): string =>
  `${periodLabel(p)} · ${p.cutoffAt ? `due ${formatInTimeZone(p.cutoffAt, BUSINESS_ZONE, "MMM d")}` : p.saved ? "no cutoff" : "standard"}`;

/** The pay period the page shows, grouped by year. Changing it keeps the tab and reloads the ledgers for the new dates. */
export function PeriodPicker({ periods, selected, tab }: { periods: PeriodOption[]; selected: string; tab: string }) {
  const router = useRouter();
  const options = useMemo<DropdownOption[]>(() => periods.map((p) => ({ value: p.id, label: optionLabel(p), group: p.start.slice(0, 4) })), [periods]);
  return (
    <Dropdown
      id="billing-period"
      label="Pay period"
      layout="stacked"
      variant="form"
      className="w-[19rem] max-w-full"
      options={options}
      value={selected}
      onChange={(id) => router.push(`/billing?tab=${tab}&period=${encodeURIComponent(id)}`)}
    />
  );
}
