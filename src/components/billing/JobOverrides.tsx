"use client";

import { useId } from "react";
import { setCancellationBilling, setKingCountyOverride } from "@/app/actions/billingOverrides";
import { useBillingAction } from "@/hooks/useBillingAction";

const SELECT = "rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--forest)] disabled:opacity-60";

/** A cancelled job: the 48-business-hour rule's answer, or staff's own (billable / not billable). */
export function CancellationControl({ requestId, current, ruleSays, source }: { requestId: string; current: "billable" | "not_billable"; ruleSays: string; source: "auto" | "staff" }) {
  const id = useId();
  const { run, pending, error } = useBillingAction();
  const value = source === "auto" ? "auto" : current;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Cancellation billing
      </label>
      <select
        id={id}
        value={value}
        disabled={pending}
        onChange={(e) => void run(() => setCancellationBilling({ requestId, value: e.target.value as "auto" | "billable" | "not_billable" }))}
        className={SELECT}
        data-cancellation-control
      >
        <option value="auto">Automatic ({ruleSays})</option>
        <option value="billable">Billable (staff)</option>
        <option value="not_billable">Not billable (staff)</option>
      </select>
      {error && <span className="text-xs text-red-700" role="alert">{error}</span>}
    </span>
  );
}

/** King County: read from the address, with a staff override if the address misleads. */
export function KingCountyControl({ requestId, value, source, matched }: { requestId: string; value: boolean; source: "auto" | "staff"; matched: string | null }) {
  const id = useId();
  const { run, pending, error } = useBillingAction();
  const autoText = value ? `King County${matched ? `: ${matched}` : ""}` : "not King County";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {value && <span className="rounded-full bg-[var(--tint)] px-2.5 py-0.5 text-xs font-medium text-[var(--tint-ink)]">King County</span>}
      <label htmlFor={id} className="sr-only">
        King County
      </label>
      <select
        id={id}
        value={source === "auto" ? "auto" : value ? "yes" : "no"}
        disabled={pending}
        onChange={(e) => void run(() => setKingCountyOverride({ requestId, value: e.target.value as "auto" | "yes" | "no" }))}
        className={SELECT}
      >
        <option value="auto">From the address ({source === "auto" ? autoText : "re-check"})</option>
        <option value="yes">King County (staff)</option>
        <option value="no">Not King County (staff)</option>
      </select>
      {error && <span className="text-xs text-red-700" role="alert">{error}</span>}
    </span>
  );
}
