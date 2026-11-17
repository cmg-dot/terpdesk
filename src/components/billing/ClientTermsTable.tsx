"use client";

import { useState } from "react";
import { setClientBilling } from "@/app/actions/billingRates";
import { quietButton, ruleInput } from "@/components/billing/rulesParts";
import { useBillingAction } from "@/hooks/useBillingAction";
import { sameAmount } from "@/lib/billing/money";
import type { ClientTermsRow } from "@/lib/billing/rulesData";

/** One organization: its own hourly rate and rounding step for Non-state jobs (empty = the agency defaults). */
function ClientTermsLine({ row, defaultRate, defaultRounding }: { row: ClientTermsRow; defaultRate: string; defaultRounding: string }) {
  const [rate, setRate] = useState(row.rate);
  const [rounding, setRounding] = useState(row.roundingMinutes);
  const { run, pending, error, fieldErrors, saved } = useBillingAction();
  // Compared as amounts: "85" saved comes back as "85.00" and is not a change.
  const dirty = !sameAmount(rate, row.rate) || rounding !== row.roundingMinutes;
  return (
    <tr className="border-b border-gray-100 last:border-b-0 align-top" data-client-terms={row.name}>
      <td className="py-2 pr-3 text-sm font-medium text-[var(--ink)]">{row.name}</td>
      <td className="w-36 py-2 pr-3">
        <input
          aria-label={`${row.name} hourly rate`}
          inputMode="decimal"
          placeholder={`${defaultRate} (default)`}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          aria-invalid={Boolean(fieldErrors.rate)}
          className={ruleInput}
        />
      </td>
      <td className="w-44 py-2 pr-3">
        <select aria-label={`${row.name} rounding`} value={rounding} onChange={(e) => setRounding(e.target.value as ClientTermsRow["roundingMinutes"])} className={ruleInput}>
          <option value="">Default ({defaultRounding} min)</option>
          <option value="30">30 minutes</option>
          <option value="15">15 minutes</option>
        </select>
      </td>
      <td className="py-2 text-right">
        <button type="button" disabled={pending || !dirty} className={quietButton} onClick={() => void run(() => setClientBilling({ clientId: row.id, rate, roundingMinutes: rounding }))}>
          {pending ? "Saving…" : "Save"}
        </button>
        {(error || (saved && !dirty)) && <div className={`mt-1 text-xs ${error ? "text-red-700" : "text-emerald-700"}`}>{error ?? "Saved."}</div>}
      </td>
    </tr>
  );
}

export function ClientTermsTable({ rows, defaultRate, defaultRounding }: { rows: ClientTermsRow[]; defaultRate: string; defaultRounding: string }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--sage)]">No organizations yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead>
          <tr className="text-left text-xs font-medium text-[var(--sage)]">
            <th className="pb-2 pr-3 font-medium">Organization</th>
            <th className="pb-2 pr-3 font-medium">Rate ($/hour)</th>
            <th className="pb-2 pr-3 font-medium">Rounding after 2 hr</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ClientTermsLine key={row.id} row={row} defaultRate={defaultRate} defaultRounding={defaultRounding} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
