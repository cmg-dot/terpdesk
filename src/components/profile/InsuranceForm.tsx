"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { saveInsurance } from "@/app/actions/insurance";
import { actionButton } from "@/components/profile/credentialFormat";
import { INSURANCE_LABEL, insuranceSchema } from "@/lib/insurance";
import type { InsuranceField, InsuranceKind, InsurancePolicy, MyInsurance } from "@/lib/insurance";

interface Props {
  kind: InsuranceKind;
  initial: InsurancePolicy | null;
  onCancel: () => void;
  onSaved: (insurance: MyInsurance) => void;
}

const INPUT = "mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.2)]";
const FIELDS: { key: InsuranceField; label: string; type?: string; placeholder?: string }[] = [
  { key: "insurer", label: "Insurance company" },
  { key: "policyNumber", label: "Policy number (optional)" },
  { key: "coverageLimits", label: "Policy limits (optional)", placeholder: "e.g. $1,000,000 per occurrence / $2,000,000 aggregate" },
  { key: "expirationDate", label: "Expiration date", type: "date" },
];

/** Add or edit one insurance policy. The same Zod schema checks it here (instant) and on the server (the real check). */
export function InsuranceForm({ kind, initial, onCancel, onSaved }: Props) {
  const [values, setValues] = useState<Record<InsuranceField, string>>({
    insurer: initial?.insurer ?? "",
    policyNumber: initial?.policyNumber ?? "",
    coverageLimits: initial?.coverageLimits ?? "",
    expirationDate: initial?.expirationDate ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<InsuranceField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = { kind, ...values };
    const check = insuranceSchema.safeParse(input);
    if (!check.success) {
      const next: Partial<Record<InsuranceField, string>> = {};
      for (const issue of check.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && field !== "kind" && !next[field as InsuranceField]) next[field as InsuranceField] = issue.message;
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    setFormError(null);
    const result = await saveInsurance(input).catch(() => null);
    setSaving(false);
    if (result?.success) onSaved(result.insurance);
    else {
      setErrors(result && !result.success ? result.fieldErrors ?? {} : {});
      setFormError(result && !result.success ? result.error : "We could not save this policy. Please try again.");
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <h3 className="text-[15px] font-semibold text-[var(--ink)]">{initial ? "Edit" : "Add"} {INSURANCE_LABEL[kind].toLowerCase()}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-xs font-medium text-[var(--sage)]">
            {f.label}
            <input
              type={f.type ?? "text"}
              value={values[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              aria-invalid={Boolean(errors[f.key])}
              className={INPUT}
            />
            {errors[f.key] && <span className="mt-1 block text-[11px] text-red-700">{errors[f.key]}</span>}
          </label>
        ))}
      </div>
      {formError && <p role="alert" className="text-[12px] text-red-700">{formError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-full bg-[var(--forest)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--forest-hover)] disabled:opacity-60">
          {saving ? "Saving…" : "Save policy"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={actionButton}>Cancel</button>
      </div>
      <p className="text-[12px] text-[var(--sage)]">After saving, add the policy document (certificate of insurance) below.</p>
    </form>
  );
}
