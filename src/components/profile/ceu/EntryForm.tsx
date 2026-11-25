"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { saveEntry } from "@/app/actions/ceu";
import { Field, inputClass } from "@/components/profile/formParts";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconInput } from "@/components/ui/IconInput";
import type { PickerChangeEvent } from "@/components/ui/IconInput";
import type { CycleView, EntryFormValues, EntryView } from "@/lib/ceu";
import { cycleChoiceLabel } from "@/lib/ceuFilters";
import { CEU_CATEGORIES, CEU_UNITS, PRIVACY_HINT, PROVIDER_MAX, TITLE_MAX, UNIT_LABEL, parseEntry } from "@/lib/validation/ceu";
import type { CeuUnit, EntryField } from "@/lib/validation/ceu";

interface EntryFormProps {
  initial: EntryFormValues;
  cycles: CycleView[];
  /** Set when editing a saved entry. */
  editingId?: string;
  onSaved: (entry: EntryView) => void;
  onCancel: () => void;
  idPrefix?: string;
  /** Inside an entry's card: no box of its own. */
  embedded?: boolean;
}

type Errors = Partial<Record<EntryField | "form", string>>;
const CATEGORY_CHOICES = CEU_CATEGORIES.map((c) => ({ value: c, label: c }));
const UNIT_CHOICES = CEU_UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] }));
const CHECK = "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-stone-100 px-4 text-[14px] text-[var(--ink)] sm:min-h-10";

/**
 * Log or edit a CEU entry. In a cycle it is counted in that cycle's unit and its date must fall inside the cycle; with no cycle you choose
 * the unit. Ethics and PPO are flags, and an entry may carry both. The same check runs here and in the server action.
 */
export function EntryForm({ initial, cycles, editingId, onSaved, onCancel, idPrefix = "ce", embedded = false }: EntryFormProps) {
  const p = idPrefix;
  const [values, setValues] = useState<EntryFormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const describe = (field: EntryField) => (errors[field] ? `${p}-${field}-error` : undefined);
  const chosen = cycles.find((c) => c.id === values.cycleId);
  const cycleChoices = [{ value: "", label: "No cycle" }, ...cycles.map((c) => ({ value: c.id, label: cycleChoiceLabel(c) }))];
  // Picking a cycle sets the unit to the cycle's; the unit is then shown, not chosen.
  const pickCycle = (id: string) => setValues((v) => ({ ...v, cycleId: id, unit: cycles.find((c) => c.id === id)?.unit ?? v.unit }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const check = parseEntry(values);
    if (!check.ok) {
      setErrors(check.fieldErrors);
      setFormError(check.error);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const result = await saveEntry(editingId ? { ...values, id: editingId } : values);
      if (result.success) onSaved(result.entry);
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
      data-ceu-entry-form=""
      aria-label={editingId ? "Edit CEU entry" : "Log a training"}
      className={embedded ? "space-y-5" : "space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"}
    >
      {embedded ? <h4 className="text-[15px] font-semibold text-[var(--ink)]">Edit entry</h4> : <h2 className="text-lg font-semibold text-[var(--ink)]">Log a training</h2>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field id={`${p}-title`} label="Title" hint={`${PRIVACY_HINT}.`} error={errors.title} className="md:col-span-2">
          <input id={`${p}-title`} type="text" maxLength={TITLE_MAX} autoFocus={embedded} value={values.title} onChange={(e) => set("title", e.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={describe("title")} placeholder="For example Medical terminology workshop" className={inputClass} />
        </Field>
        <Field id={`${p}-provider`} label="Provider (optional)" error={errors.provider}>
          <input id={`${p}-provider`} type="text" maxLength={PROVIDER_MAX} value={values.provider} onChange={(e) => set("provider", e.target.value)} aria-invalid={Boolean(errors.provider)} aria-describedby={describe("provider")} className={inputClass} />
        </Field>
        <Field id={`${p}-category`} label="Category" error={errors.category}>
          <Dropdown id={`${p}-category`} value={values.category} options={CATEGORY_CHOICES} invalid={Boolean(errors.category)} describedBy={describe("category")} onChange={(next) => set("category", next)} />
        </Field>
        <Field id={`${p}-earnedOn`} label="Date earned" error={errors.earnedOn}>
          <IconInput
            kind="date"
            id={`${p}-earnedOn`}
            className={inputClass}
            value={values.earnedOn}
            aria-invalid={Boolean(errors.earnedOn)}
            aria-describedby={describe("earnedOn")}
            onChange={(e: PickerChangeEvent) => set("earnedOn", e.target.value)}
          />
        </Field>
        <Field id={`${p}-amount`} label={`Amount (${UNIT_LABEL[values.unit].toLowerCase()})`} hint="Up to two decimals, for example 0.3." error={errors.amount}>
          <input id={`${p}-amount`} type="text" inputMode="decimal" maxLength={6} value={values.amount} onChange={(e) => set("amount", e.target.value)} aria-invalid={Boolean(errors.amount)} aria-describedby={describe("amount")} className={inputClass} />
        </Field>
        <Field id={`${p}-cycleId`} label="Renewal cycle" error={errors.cycleId}>
          <Dropdown id={`${p}-cycleId`} value={values.cycleId} options={cycleChoices} invalid={Boolean(errors.cycleId)} describedBy={describe("cycleId")} onChange={pickCycle} />
        </Field>
        {chosen ? (
          <p className="self-end pb-2.5 text-[12px] text-gray-500" data-ceu-unit-locked="">
            Counted in {UNIT_LABEL[chosen.unit].toLowerCase()}, as set by this cycle.
          </p>
        ) : (
          <Field id={`${p}-unit`} label="Counted in" error={errors.unit}>
            <Dropdown id={`${p}-unit`} value={values.unit} options={UNIT_CHOICES} invalid={Boolean(errors.unit)} describedBy={describe("unit")} onChange={(next) => set("unit", next as CeuUnit)} />
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">
          <label className={CHECK}>
            <input type="checkbox" className="h-4 w-4 accent-[var(--forest)]" checked={values.isEthics} onChange={(e) => set("isEthics", e.target.checked)} />
            Counts toward Ethics
          </label>
          <label className={CHECK}>
            <input type="checkbox" className="h-4 w-4 accent-[var(--forest)]" checked={values.isPpo} onChange={(e) => set("isPpo", e.target.checked)} />
            Counts toward PPO
          </label>
        </div>
      </div>

      {formError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-800">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="min-h-11 flex-1 rounded-full bg-[var(--forest)] px-6 text-[14px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 sm:min-h-10 sm:flex-none">
          {saving ? "Saving..." : editingId ? "Save changes" : "Save entry"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 flex-1 rounded-full border border-gray-200 bg-white px-6 text-[14px] font-medium text-gray-700 hover:bg-gray-50 sm:min-h-10 sm:flex-none">
          Cancel
        </button>
      </div>
    </form>
  );
}
