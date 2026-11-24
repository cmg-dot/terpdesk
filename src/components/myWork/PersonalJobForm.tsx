"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { savePersonalJob } from "@/app/actions/personalJobs";
import { Field, inputClass } from "@/components/profile/formParts";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconInput } from "@/components/ui/IconInput";
import type { PersonalJobFormValues, PersonalJobView } from "@/lib/personalJobs";
import { FILTER_SETTINGS } from "@/lib/requestOptions";
import { LABEL_HINT, LABEL_MAX, parsePersonalJob } from "@/lib/validation/personalJob";
import type { PersonalJobField } from "@/lib/validation/personalJob";
import { PROFILE_TIME_ZONES } from "@/lib/validation/interpreterProfile";

interface PersonalJobFormProps {
  initial: PersonalJobFormValues;
  /** Set when editing a saved job. */
  editingId?: string;
  onSaved: (job: PersonalJobView) => void;
  onCancel: () => void;
  /** Starts every field id (so the add form and an edit open in a card never share one). */
  idPrefix?: string;
  /** Inside a job's card: no box of its own, and the first field takes the cursor when it opens. */
  embedded?: boolean;
}

type Errors = Partial<Record<PersonalJobField, string>>;

const SETTING_CHOICES = [{ value: "", label: "Not stated" }, ...FILTER_SETTINGS.map((s) => ({ value: s, label: s }))];

/**
 * Add or edit a personal job: when, setting, break, miles. The same check runs here (instant feedback) and in the server action (the
 * one that counts). The label is optional, private to the interpreter, and says plainly not to put client names in it.
 */
export function PersonalJobForm({ initial, editingId, onSaved, onCancel, idPrefix = "pj", embedded = false }: PersonalJobFormProps) {
  const p = idPrefix;
  const [values, setValues] = useState<PersonalJobFormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PersonalJobFormValues>(key: K, value: PersonalJobFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const knownZone = PROFILE_TIME_ZONES.some((z) => z.value === values.timeZone);
  const describe = (field: PersonalJobField) => (errors[field] ? `${p}-${field}-error` : undefined);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const check = parsePersonalJob(values);
    if (!check.ok) {
      setErrors(check.fieldErrors);
      setFormError(check.error);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const result = await savePersonalJob(editingId ? { ...values, id: editingId } : values);
      if (result.success) onSaved(result.job);
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
    <form onSubmit={submit} noValidate data-personal-job-form="" aria-label={editingId ? "Edit personal job" : "Add a personal job"} className={embedded ? "space-y-5" : "space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"}>
      {embedded ? (
        <h4 className="text-[15px] font-semibold text-[var(--ink)]">Edit personal job</h4>
      ) : (
        <h2 className="text-lg font-semibold text-[var(--ink)]">{editingId ? "Edit personal job" : "Add a personal job"}</h2>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Field id={`${p}-label`} label="Label (optional)" hint={`${LABEL_HINT}. Only you can see this.`} error={errors.label} className="md:col-span-2">
          <input
            id={`${p}-label`}
            type="text"
            maxLength={LABEL_MAX}
            autoFocus={embedded}
            value={values.label}
            onChange={(e) => set("label", e.target.value)}
            placeholder="For example Conference, Community class"
            className={inputClass}
          />
        </Field>

        <Field id={`${p}-startDate`} label="Start date" error={errors.startDate}>
          <IconInput
            id={`${p}-startDate`}
            kind="date"
            value={values.startDate}
            aria-invalid={Boolean(errors.startDate)}
            aria-describedby={describe("startDate")}
            onChange={(e) => setValues((v) => ({ ...v, startDate: e.target.value, endDate: v.endDate < e.target.value ? e.target.value : v.endDate }))}
            className={inputClass}
          />
        </Field>
        <Field id={`${p}-startTime`} label="Start time" error={errors.startTime}>
          <IconInput id={`${p}-startTime`} kind="time" value={values.startTime} aria-invalid={Boolean(errors.startTime)} aria-describedby={describe("startTime")} onChange={(e) => set("startTime", e.target.value)} className={inputClass} />
        </Field>
        <Field id={`${p}-endDate`} label="End date" error={errors.endDate}>
          <IconInput id={`${p}-endDate`} kind="date" value={values.endDate} min={values.startDate} aria-invalid={Boolean(errors.endDate)} aria-describedby={describe("endDate")} onChange={(e) => set("endDate", e.target.value)} className={inputClass} />
        </Field>
        <Field id={`${p}-endTime`} label="End time" error={errors.endTime}>
          <IconInput id={`${p}-endTime`} kind="time" value={values.endTime} aria-invalid={Boolean(errors.endTime)} aria-describedby={describe("endTime")} onChange={(e) => set("endTime", e.target.value)} className={inputClass} />
        </Field>

        <Field id={`${p}-timeZone`} label="Time zone" hint="The zone you are entering these times in." error={errors.timeZone}>
          <Dropdown
            id={`${p}-timeZone`}
            value={values.timeZone}
            options={knownZone ? PROFILE_TIME_ZONES : [{ value: values.timeZone, label: values.timeZone }, ...PROFILE_TIME_ZONES]}
            invalid={Boolean(errors.timeZone)}
            describedBy={describe("timeZone")}
            onChange={(next) => set("timeZone", next)}
          />
        </Field>
        <Field id={`${p}-setting`} label="Setting (optional)" error={errors.setting}>
          <Dropdown id={`${p}-setting`} value={values.setting} options={SETTING_CHOICES} invalid={Boolean(errors.setting)} describedBy={describe("setting")} onChange={(next) => set("setting", next)} />
        </Field>

        <Field id={`${p}-breakMinutes`} label="Unpaid break, in minutes (optional)" hint="Taken off the hours worked." error={errors.breakMinutes}>
          <input id={`${p}-breakMinutes`} type="text" inputMode="numeric" value={values.breakMinutes} onChange={(e) => set("breakMinutes", e.target.value)} aria-invalid={Boolean(errors.breakMinutes)} aria-describedby={describe("breakMinutes")} className={inputClass} />
        </Field>
        <Field id={`${p}-miles`} label="Miles driven (optional)" hint="One way. Tick round trip to count them twice." error={errors.miles}>
          <input id={`${p}-miles`} type="text" inputMode="decimal" value={values.miles} onChange={(e) => set("miles", e.target.value)} aria-invalid={Boolean(errors.miles)} aria-describedby={describe("miles")} placeholder="For example 12.5" className={inputClass} />
          <label className="mt-2 inline-flex items-center gap-2.5 text-sm text-gray-800">
            <input type="checkbox" checked={values.roundTrip} onChange={(e) => set("roundTrip", e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-[var(--forest)]" />
            Round trip (counts double)
          </label>
        </Field>
      </div>

      {formError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-800">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="min-h-11 flex-1 rounded-full bg-[var(--forest)] px-6 text-[14px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 sm:min-h-10 sm:flex-none">
          {saving ? "Saving..." : editingId ? "Save changes" : "Save personal job"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 flex-1 rounded-full border border-gray-200 bg-white px-6 text-[14px] font-medium text-gray-700 hover:bg-gray-50 sm:min-h-10 sm:flex-none">
          Cancel
        </button>
      </div>
    </form>
  );
}
