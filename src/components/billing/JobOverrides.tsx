"use client";

import { useId, useMemo } from "react";
import { setCancellationBilling, setKingCountyOverride } from "@/app/actions/billingOverrides";
import { Dropdown } from "@/components/ui/Dropdown";
import { useBillingAction } from "@/hooks/useBillingAction";
import type { DropdownOption } from "@/lib/dropdown";

type CancellationValue = "auto" | "billable" | "not_billable";
type KingCountyValue = "auto" | "yes" | "no";

const isCancellationValue = (v: string): v is CancellationValue => v === "auto" || v === "billable" || v === "not_billable";
const isKingCountyValue = (v: string): v is KingCountyValue => v === "auto" || v === "yes" || v === "no";

/** A cancelled job: the 48-business-hour rule's answer, or staff's own (billable / not billable). */
export function CancellationControl({ requestId, current, ruleSays, source }: { requestId: string; current: "billable" | "not_billable"; ruleSays: string; source: "auto" | "staff" }) {
  const id = useId();
  const { run, pending, error } = useBillingAction();
  const options = useMemo<DropdownOption[]>(
    () => [
      { value: "auto", label: `Automatic (${ruleSays})` },
      { value: "billable", label: "Billable (staff)" },
      { value: "not_billable", label: "Not billable (staff)" },
    ],
    [ruleSays],
  );
  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-cancellation-control="">
      <Dropdown
        id={`${id}-cancellation`}
        ariaLabel="Cancellation billing"
        variant="compact"
        disabled={pending}
        options={options}
        value={source === "auto" ? "auto" : current}
        onChange={(value) => {
          if (isCancellationValue(value)) void run(() => setCancellationBilling({ requestId, value }));
        }}
      />
      {error && <span className="text-xs text-red-700" role="alert">{error}</span>}
    </span>
  );
}

/** King County: read from the address, with a staff override if the address misleads. */
export function KingCountyControl({ requestId, value, source, matched }: { requestId: string; value: boolean; source: "auto" | "staff"; matched: string | null }) {
  const id = useId();
  const { run, pending, error } = useBillingAction();
  const autoText = source === "auto" ? (value ? `King County${matched ? `: ${matched}` : ""}` : "not King County") : "re-check";
  const options = useMemo<DropdownOption[]>(
    () => [
      { value: "auto", label: `From the address (${autoText})` },
      { value: "yes", label: "King County (staff)" },
      { value: "no", label: "Not King County (staff)" },
    ],
    [autoText],
  );
  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-king-county-control="">
      <Dropdown
        id={`${id}-king-county`}
        ariaLabel="King County"
        variant="compact"
        disabled={pending}
        options={options}
        value={source === "auto" ? "auto" : value ? "yes" : "no"}
        onChange={(next) => {
          if (isKingCountyValue(next)) void run(() => setKingCountyOverride({ requestId, value: next }));
        }}
      />
      {error && <span className="text-xs text-red-700" role="alert">{error}</span>}
    </span>
  );
}
