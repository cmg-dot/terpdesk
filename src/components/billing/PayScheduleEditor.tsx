"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { deletePayPeriod, savePayPeriod } from "@/app/actions/billingSettings";
import { RuleCard, RuleField, SaveStatus, primaryButton, quietButton, ruleInput } from "@/components/billing/rulesParts";
import { useBillingAction } from "@/hooks/useBillingAction";
import { cutoffLabel, dayLabel, periodLabel } from "@/lib/billing/format";
import type { PayPeriod } from "@/lib/billing/payPeriods";
import type { PayPeriodInput } from "@/lib/validation/billing";

const EMPTY: PayPeriodInput = { start: "", end: "", cutoffDate: "", cutoffTime: "12:00", payDate: "" };

/** The cutoff instant as the form's date and time on the agency's clock. */
const toForm = (p: PayPeriod, cutoff: { date: string; time: string } | null): PayPeriodInput => ({
  id: p.id,
  start: p.start,
  end: p.end,
  cutoffDate: cutoff?.date ?? "",
  cutoffTime: cutoff?.time ?? "12:00",
  payDate: p.payDate ?? "",
});

/**
 * The semi-monthly pay schedule: each period's service dates, its invoice cutoff (noon Pacific unless changed) and its pay date. A
 * date no saved period covers falls in a standard half-month (1st-15th, 16th-end) until one is added.
 */
export function PayScheduleEditor({ periods, cutoffParts }: { periods: PayPeriod[]; cutoffParts: Record<string, { date: string; time: string }> }) {
  const [form, setForm] = useState<PayPeriodInput>(EMPTY);
  const { run, pending, error, fieldErrors, saved, setFieldErrors } = useBillingAction();
  const remover = useBillingAction();
  const set = (field: keyof PayPeriodInput) => (value: string) => setForm((f) => ({ ...f, [field]: value }));
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => savePayPeriod(form))) setForm(EMPTY);
  };
  const date = (field: "start" | "end" | "cutoffDate" | "payDate", label: string, hint?: string) => (
    <RuleField id={`pp-${field}`} label={label} hint={hint} error={fieldErrors[field]}>
      <input id={`pp-${field}`} type="date" value={form[field]} onChange={(e) => set(field)(e.target.value)} aria-invalid={Boolean(fieldErrors[field])} className={ruleInput} />
    </RuleField>
  );

  return (
    <RuleCard title="Pay schedule (semi-monthly)" note="Service dates paid in each run, when invoices are due (noon Pacific) and the pay date.">
      {periods.length === 0 ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">No pay periods are saved yet: the standard halves of the month are used, with no cutoff or pay date. Add Kari&apos;s schedule below.</p>
      ) : (
        <ul className="mb-5 divide-y divide-gray-100 text-sm">
          {periods.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                <span className="font-medium text-[var(--ink)]">{periodLabel(p)}</span>
                <span className="text-[var(--sage)]">
                  {p.cutoffAt ? ` · invoices due ${cutoffLabel(p.cutoffAt)}` : " · no cutoff"}
                  {p.payDate ? ` · paid ${dayLabel(p.payDate)}` : " · no pay date"}
                </span>
              </span>
              <span className="flex gap-2">
                <button type="button" className={quietButton} onClick={() => { setFieldErrors({}); setForm(toForm(p, cutoffParts[p.id] ?? null)); }}>
                  Edit
                </button>
                <button type="button" className={quietButton} disabled={remover.pending} onClick={() => void remover.run(() => deletePayPeriod({ id: p.id }))}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {date("start", "Service from")}
          {date("end", "Service to")}
          {date("cutoffDate", "Invoices due")}
          <RuleField id="pp-cutoffTime" label="at (Pacific)" error={fieldErrors.cutoffTime}>
            <input id="pp-cutoffTime" type="time" value={form.cutoffTime} onChange={(e) => set("cutoffTime")(e.target.value)} className={ruleInput} />
          </RuleField>
          {date("payDate", "Pay date")}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Saving…" : form.id ? "Save pay period" : "Add pay period"}
          </button>
          {form.id && (
            <button type="button" className={quietButton} onClick={() => setForm(EMPTY)}>
              Cancel editing
            </button>
          )}
          <SaveStatus error={error ?? remover.error} saved={saved} />
        </div>
      </form>
    </RuleCard>
  );
}
