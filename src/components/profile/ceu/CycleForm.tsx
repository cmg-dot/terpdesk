"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { saveCycle } from "@/app/actions/ceu";
import { Field, inputClass } from "@/components/profile/formParts";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconInput } from "@/components/ui/IconInput";
import type { PickerChangeEvent } from "@/components/ui/IconInput";
import type { CycleFormValues, CycleView } from "@/lib/ceu";
import { CEU_UNITS, LABEL_MAX, UNIT_LABEL, parseCycle } from "@/lib/validation/ceu";
import type { CeuUnit, CycleField } from "@/lib/validation/ceu";
import type { MyCredential } from "@/lib/validation/credential";

interface CycleFormProps {
  initial: CycleFormValues;
  credentials: MyCredential[];
  /** Set when editing a saved cycle. */
  editingId?: string;
  /** Entries already logged in this cycle: while there are any, the unit cannot change. */
  entryCount?: number;
  onSaved: (cycle: CycleView) => void;
  onCancel: () => void;
  idPrefix?: string;
  /** Inside a cycle's card: no box of its own. */
  embedded?: boolean;
}

type Errors = Partial<Record<CycleField | "form", string>>;
const UNIT_CHOICES = CEU_UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] }));
const targetInput = { type: "text", inputMode: "decimal" as const, maxLength: 6, className: inputClass };

/**
 * Add or edit a renewal cycle: a name, the dates your certifying body gives, the unit it counts in (CEUs or hours, never converted) and
 * optional targets. Linking a credential is optional: it only fills in the name and end date, and the cycle works without one.
 */
export function CycleForm({ initial, credentials, editingId, entryCount = 0, onSaved, onCancel, idPrefix = "cy", embedded = false }: CycleFormProps) {
  const p = idPrefix;
  const [values, setValues] = useState<CycleFormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CycleFormValues>(key: K, value: CycleFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const describe = (field: CycleField) => (errors[field] ? `${p}-${field}-error` : undefined);
  const dateBind = (field: "cycleStart" | "cycleEnd") => ({
    id: `${p}-${field}`,
    value: values[field],
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": describe(field),
    onChange: (e: PickerChangeEvent) => set(field, e.target.value),
  });

  const choices = [{ value: "", label: "Not linked to a credential" }, ...credentials.map((c) => ({ value: c.id, label: c.name }))];
  const link = (id: string) => {
    const credential = credentials.find((c) => c.id === id);
    setValues((v) => ({
      ...v,
      credentialId: id,
      label: credential && !v.label.trim() ? credential.name : v.label,
      cycleEnd: credential?.expirationDate && !v.cycleEnd ? credential.expirationDate : v.cycleEnd,
    }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const check = parseCycle(values);
    if (!check.ok) {
      setErrors(check.fieldErrors);
      setFormError(check.error);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const result = await saveCycle(editingId ? { ...values, id: editingId } : values);
      if (result.success) onSaved(result.cycle);
      else {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      data-ceu-cycle-form=""
      aria-label={editingId ? "Edit renewal cycle" : "New renewal cycle"}
      className={embedded ? "space-y-5" : "space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"}
    >
      {embedded ? <h4 className="text-[15px] font-semibold text-[var(--ink)]">Edit cycle</h4> : <h2 className="text-lg font-semibold text-[var(--ink)]">New renewal cycle</h2>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field id={`${p}-label`} label="Name" hint="For example: State court renewal, or your certification cycle." error={errors.label} className="md:col-span-2">
          <input id={`${p}-label`} type="text" maxLength={LABEL_MAX} autoFocus={embedded} value={values.label} onChange={(e) => set("label", e.target.value)} aria-invalid={Boolean(errors.label)} aria-describedby={describe("label")} className={inputClass} />
        </Field>
        <Field id={`${p}-credentialId`} label="Linked credential (optional)" hint="Fills in the name and end date. Your agency still sees only what is on your Credentials tab." error={errors.credentialId} className="md:col-span-2">
          <Dropdown id={`${p}-credentialId`} value={values.credentialId} options={choices} invalid={Boolean(errors.credentialId)} describedBy={describe("credentialId")} onChange={link} />
        </Field>
        <Field id={`${p}-cycleStart`} label="Cycle starts" error={errors.cycleStart}>
          <IconInput kind="date" className={inputClass} {...dateBind("cycleStart")} />
        </Field>
        <Field id={`${p}-cycleEnd`} label="Cycle ends" error={errors.cycleEnd}>
          <IconInput kind="date" className={inputClass} {...dateBind("cycleEnd")} />
        </Field>
        <Field id={`${p}-unit`} label="Counted in" hint={entryCount > 0 ? "Locked while entries are logged in this cycle." : "Use the unit your certifying body uses. We never convert between them."} error={errors.unit} className="md:col-span-2">
          <Dropdown id={`${p}-unit`} value={values.unit} options={UNIT_CHOICES} disabled={entryCount > 0} invalid={Boolean(errors.unit)} describedBy={describe("unit")} onChange={(next) => set("unit", next as CeuUnit)} />
        </Field>
        <Field id={`${p}-requiredTotal`} label="Total target (optional)" error={errors.requiredTotal}>
          <input id={`${p}-requiredTotal`} {...targetInput} value={values.requiredTotal} onChange={(e) => set("requiredTotal", e.target.value)} aria-invalid={Boolean(errors.requiredTotal)} aria-describedby={describe("requiredTotal")} placeholder="For example 8" />
        </Field>
        <Field id={`${p}-requiredEthics`} label="Ethics target (optional)" error={errors.requiredEthics}>
          <input id={`${p}-requiredEthics`} {...targetInput} value={values.requiredEthics} onChange={(e) => set("requiredEthics", e.target.value)} aria-invalid={Boolean(errors.requiredEthics)} aria-describedby={describe("requiredEthics")} placeholder="For example 1" />
        </Field>
        <Field id={`${p}-requiredPpo`} label="PPO target (optional)" hint="Power, Privilege and Oppression. Leave targets empty if your body has no such requirement." error={errors.requiredPpo} className="md:col-span-2">
          <input id={`${p}-requiredPpo`} {...targetInput} value={values.requiredPpo} onChange={(e) => set("requiredPpo", e.target.value)} aria-invalid={Boolean(errors.requiredPpo)} aria-describedby={describe("requiredPpo")} placeholder="For example 1" />
        </Field>
      </div>

      {formError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-800">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="min-h-11 flex-1 rounded-full bg-[var(--forest)] px-6 text-[14px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 sm:min-h-10 sm:flex-none">
          {saving ? "Saving..." : editingId ? "Save changes" : "Save cycle"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 flex-1 rounded-full border border-gray-200 bg-white px-6 text-[14px] font-medium text-gray-700 hover:bg-gray-50 sm:min-h-10 sm:flex-none">
          Cancel
        </button>
      </div>
    </form>
  );
}
