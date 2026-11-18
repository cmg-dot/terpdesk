"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { savePayPeriod } from "@/app/actions/billingSettings";
import { RuleField, SaveStatus, primaryButton, quietButton, ruleInput } from "@/components/billing/rulesParts";
import { IconInput } from "@/components/ui/IconInput";
import { useBillingAction } from "@/hooks/useBillingAction";
import type { PayPeriodInput } from "@/lib/validation/billing";

export const EMPTY_PAY_PERIOD: PayPeriodInput = { start: "", end: "", cutoffDate: "", cutoffTime: "12:00", payDate: "" };

type DateField = "start" | "end" | "cutoffDate" | "payDate";
const DATES: { field: DateField; label: string; optional?: boolean }[] = [
  { field: "start", label: "Service from" },
  { field: "end", label: "Service to" },
  { field: "cutoffDate", label: "Invoices due", optional: true },
  { field: "payDate", label: "Pay date", optional: true },
];

/**
 * One pay period's fields, with the app's calendar and time pickers: service dates, the invoice cutoff (date and time, noon
 * Pacific by default) and the pay date. Used inline, both to add a period at the top of the schedule and to edit one in its row.
 */
export function PayPeriodForm({ initial, idPrefix, submitLabel, onDone }: { initial: PayPeriodInput; idPrefix: string; submitLabel: string; onDone: () => void }) {
  const [form, setForm] = useState<PayPeriodInput>(initial);
  const { run, pending, error, fieldErrors } = useBillingAction();
  const set = (field: keyof PayPeriodInput) => (value: string) => setForm((f) => ({ ...f, [field]: value }));
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => savePayPeriod(form))) onDone();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-xl border border-[rgb(var(--forest-rgb)/0.2)] bg-[var(--canvas)] p-4" data-pay-period-form={idPrefix}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {DATES.map((d) => (
          <RuleField key={d.field} id={`${idPrefix}-${d.field}`} label={d.label} error={fieldErrors[d.field]}>
            <IconInput
              kind="date"
              id={`${idPrefix}-${d.field}`}
              value={form[d.field] ?? ""}
              onChange={(e) => set(d.field)(e.target.value)}
              clearable={d.optional}
              aria-invalid={Boolean(fieldErrors[d.field])}
              className={ruleInput}
            />
          </RuleField>
        ))}
        <RuleField id={`${idPrefix}-cutoffTime`} label="Due at (Pacific)" error={fieldErrors.cutoffTime}>
          <IconInput kind="time" id={`${idPrefix}-cutoffTime`} value={form.cutoffTime ?? "12:00"} onChange={(e) => set("cutoffTime")(e.target.value)} className={ruleInput} />
        </RuleField>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className={quietButton}>
          Cancel
        </button>
        <SaveStatus error={error} saved={false} />
      </div>
    </form>
  );
}
