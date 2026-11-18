"use client";

import { useState } from "react";
import { setEveningRate } from "@/app/actions/billingRates";
import { updateInterpreterRates } from "@/app/actions/interpreterRates";
import { quietButton, rowSaveButton, tableInput } from "@/components/billing/rulesParts";
import { useBillingAction } from "@/hooks/useBillingAction";
import type { BillingActionResult } from "@/lib/billing/actionGuard";
import { sameAmount } from "@/lib/billing/money";
import type { InterpreterRateRow } from "@/lib/billing/rulesData";

type RateField = "stateRate" | "kingCountyRate" | "nonStateRate" | "eveningRate";
const COLUMNS: { field: RateField; label: string }[] = [
  { field: "stateRate", label: "State" },
  { field: "kingCountyRate", label: "King County" },
  { field: "nonStateRate", label: "Non-state" },
  { field: "eveningRate", label: "Evening travel" },
];

/** Saves the hourly rates (their own action, as on the interpreter's page) and then the evening rate, as one step. */
async function saveRow(id: string, row: InterpreterRateRow, eveningChanged: boolean): Promise<BillingActionResult> {
  const rates = await updateInterpreterRates({ interpreterId: id, stateRate: row.stateRate, kingCountyRate: row.kingCountyRate, nonStateRate: row.nonStateRate });
  if (!rates.success) return { success: false, error: rates.error, fieldErrors: rates.fieldErrors };
  return eveningChanged ? setEveningRate({ interpreterId: id, eveningRate: row.eveningRate }) : { success: true };
}

function RateLine({ row }: { row: InterpreterRateRow }) {
  const [values, setValues] = useState<InterpreterRateRow>(row);
  const { run, pending, error, fieldErrors, saved } = useBillingAction();
  // Compared as amounts: "120" saved comes back as "120.00" and is not a change.
  const dirty = COLUMNS.some((c) => !sameAmount(values[c.field], row[c.field]));
  return (
    <tr className="border-b border-gray-100 align-top last:border-b-0">
      <td className="py-2 pr-3 text-sm font-medium text-[var(--ink)]">{row.name}</td>
      {COLUMNS.map((c) => (
        <td key={c.field} className="w-32 py-2 pr-2">
          <input
            aria-label={`${row.name} ${c.label} rate`}
            inputMode="decimal"
            placeholder="Not set"
            value={values[c.field]}
            onChange={(e) => setValues((v) => ({ ...v, [c.field]: e.target.value }))}
            aria-invalid={Boolean(fieldErrors[c.field])}
            className={tableInput}
          />
        </td>
      ))}
      <td className="py-2 text-right">
        <button type="button" disabled={pending || !dirty} className={pending ? quietButton : rowSaveButton} onClick={() => void run(() => saveRow(row.id, values, !sameAmount(values.eveningRate, row.eveningRate)))}>
          {pending ? "Saving…" : "Save"}
        </button>
        {(error || (saved && !dirty)) && <div className={`mt-1 text-xs ${error ? "text-red-700" : "text-emerald-700"}`}>{error ?? "Saved."}</div>}
      </td>
    </tr>
  );
}

/** Every roster interpreter's hourly rates ($/hour), editable in place. Agency only: interpreters never see these. */
export function InterpreterRatesTable({ rows }: { rows: InterpreterRateRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--sage)]">No interpreters on the roster yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="text-left text-xs font-medium text-[var(--sage)]">
            <th className="pb-2 pr-3 font-medium">Interpreter</th>
            {COLUMNS.map((c) => (
              <th key={c.field} className="pb-2 pr-2 font-medium">
                {c.label}
              </th>
            ))}
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RateLine key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
