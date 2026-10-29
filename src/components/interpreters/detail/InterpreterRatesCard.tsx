"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { updateInterpreterRates } from "@/app/actions/interpreterRates";
import { Field, inputClass } from "@/components/profile/formParts";
import { NON_STATE_MINIMUM_HOURS, STATE_MINIMUM_HOURS, formatHours } from "@/lib/billingMinimums";
import { interpreterRatesFieldsSchema } from "@/lib/validation/interpreterRates";
import type { InterpreterRatesField, InterpreterRatesInput } from "@/lib/validation/interpreterRates";

type FieldErrors = Partial<Record<InterpreterRatesField, string>>;

interface RateInputProps {
  field: InterpreterRatesField;
  label: string;
  hint: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

const RateInput = ({ field, label, hint, value, error, onChange }: RateInputProps) => (
  <Field id={`rate-${field}`} label={label} hint={hint} error={error}>
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
      <input
        id={`rate-${field}`}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value}
        placeholder="Not set"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `rate-${field}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} pl-8 pr-14`}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500">/ hour</span>
    </div>
  </Field>
);

/** Agency-only: set the State and Non-state hourly rates for an interpreter. Interpreters never see this card. */
export const InterpreterRatesCard = ({ interpreterId, initial }: { interpreterId: string; initial: InterpreterRatesInput }) => {
  const [values, setValues] = useState<InterpreterRatesInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ kind: "error" | "saved"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setMessage(null);

    const check = interpreterRatesFieldsSchema.safeParse(values);
    if (!check.success) {
      const next: FieldErrors = {};
      for (const issue of check.error.issues) {
        const field = issue.path[0] as InterpreterRatesField | undefined;
        if (field && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const result = await updateInterpreterRates({ interpreterId, ...values });
      if (result.success) {
        setValues(result.rates);
        setMessage({ kind: "saved", text: "Rates saved." });
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage({ kind: "error", text: result.error });
      }
    } catch {
      setMessage({ kind: "error", text: "Something went wrong. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold text-[var(--ink)]">Rates</h2>
      <p className="mb-4 text-[13px] text-gray-500">Only agency staff can see and change these. Interpreters never see them.</p>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <RateInput
            field="stateRate"
            label="State rate"
            hint={`For State jobs (ODHH). Billed for at least ${formatHours(STATE_MINIMUM_HOURS)} hours.`}
            value={values.stateRate}
            error={errors.stateRate}
            onChange={(stateRate) => setValues((v) => ({ ...v, stateRate }))}
          />
          <RateInput
            field="nonStateRate"
            label="Non-state rate"
            hint={`For Non-state jobs (HCA, private). Billed for at least ${formatHours(NON_STATE_MINIMUM_HOURS)} hours.`}
            value={values.nonStateRate}
            error={errors.nonStateRate}
            onChange={(nonStateRate) => setValues((v) => ({ ...v, nonStateRate }))}
          />
        </div>
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-[#0B3B32] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#082a23] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save rates"}
          </button>
          {message && (
            <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm font-medium ${message.kind === "error" ? "text-red-700" : "text-emerald-700"}`}>
              {message.text}
            </p>
          )}
        </div>
      </form>
    </section>
  );
};
