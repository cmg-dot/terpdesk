"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { saveGlossaryTerm } from "@/app/actions/glossary";
import { Field, inputClass } from "@/components/profile/formParts";
import { Dropdown } from "@/components/ui/Dropdown";
import type { GlossaryFormValues, GlossaryTermView } from "@/lib/glossary";
import { FILTER_SETTINGS } from "@/lib/requestOptions";
import { GLOSSARY_LANGUAGES, NOTE_HINT, NOTE_MAX, RENDERING_MAX, TERM_MAX, parseGlossaryTerm } from "@/lib/validation/glossaryTerm";
import type { GlossaryTermField } from "@/lib/validation/glossaryTerm";

interface GlossaryFormProps {
  initial: GlossaryFormValues;
  /** Set when editing a saved term. */
  editingId?: string;
  onSaved: (term: GlossaryTermView) => void;
  onCancel: () => void;
  /** Starts every field id (so the add form and an edit open in a card never share one). */
  idPrefix?: string;
  /** Inside a term's card: no box of its own, and the first field takes the cursor when it opens. */
  embedded?: boolean;
}

type Errors = Partial<Record<GlossaryTermField, string>>;

const LANGUAGE_CHOICES = GLOSSARY_LANGUAGES.map((l) => ({ value: l, label: l }));
const SETTING_CHOICES = [{ value: "", label: "Not stated" }, ...FILTER_SETTINGS.map((s) => ({ value: s, label: s }))];

/**
 * Add or edit a glossary term: the source term (English, or whatever the pair's source is), the target rendering (for ASL a gloss or a short
 * sign note; for a spoken language the equivalent term), the language pair, an optional setting and a context note. The same check runs
 * here (instant feedback) and in the server action (the one that counts).
 */
export function GlossaryForm({ initial, editingId, onSaved, onCancel, idPrefix = "gl", embedded = false }: GlossaryFormProps) {
  const p = idPrefix;
  const [values, setValues] = useState<GlossaryFormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof GlossaryFormValues>(key: K, value: GlossaryFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const describe = (field: GlossaryTermField) => (errors[field] ? `${p}-${field}-error` : undefined);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const check = parseGlossaryTerm(values);
    if (!check.ok) {
      setErrors(check.fieldErrors);
      setFormError(check.error);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const result = await saveGlossaryTerm(editingId ? { ...values, id: editingId } : values);
      if (result.success) onSaved(result.term);
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
      data-glossary-form=""
      aria-label={editingId ? "Edit glossary term" : "Add a glossary term"}
      className={embedded ? "space-y-5" : "space-y-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"}
    >
      {embedded ? <h4 className="text-[15px] font-semibold text-[var(--ink)]">Edit term</h4> : <h2 className="text-lg font-semibold text-[var(--ink)]">{editingId ? "Edit term" : "Add a term"}</h2>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field id={`${p}-term`} label="English / Source term" hint="The word or phrase you want to remember." error={errors.term}>
          <input
            id={`${p}-term`}
            type="text"
            maxLength={TERM_MAX}
            autoFocus={embedded}
            value={values.term}
            onChange={(e) => set("term", e.target.value)}
            aria-invalid={Boolean(errors.term)}
            aria-describedby={describe("term")}
            placeholder="For example discharge summary"
            className={inputClass}
          />
        </Field>
        <Field
          id={`${p}-rendering`}
          label="ASL Gloss / Target rendering"
          hint="For ASL, a gloss or a short sign note. For a spoken language, the equivalent term."
          error={errors.rendering}
        >
          <input
            id={`${p}-rendering`}
            type="text"
            maxLength={RENDERING_MAX}
            value={values.rendering}
            onChange={(e) => set("rendering", e.target.value)}
            aria-invalid={Boolean(errors.rendering)}
            aria-describedby={describe("rendering")}
            placeholder="For example DISCHARGE-PAPERS"
            className={inputClass}
          />
        </Field>

        <Field id={`${p}-sourceLang`} label="Source language" error={errors.sourceLang}>
          <Dropdown id={`${p}-sourceLang`} value={values.sourceLang} options={LANGUAGE_CHOICES} invalid={Boolean(errors.sourceLang)} describedBy={describe("sourceLang")} onChange={(next) => set("sourceLang", next)} />
        </Field>
        <Field id={`${p}-targetLang`} label="Target language" error={errors.targetLang}>
          <Dropdown id={`${p}-targetLang`} value={values.targetLang} options={LANGUAGE_CHOICES} invalid={Boolean(errors.targetLang)} describedBy={describe("targetLang")} onChange={(next) => set("targetLang", next)} />
        </Field>

        <Field id={`${p}-setting`} label="Setting (optional)" error={errors.setting} className="md:col-span-2">
          <Dropdown id={`${p}-setting`} value={values.setting} options={SETTING_CHOICES} invalid={Boolean(errors.setting)} describedBy={describe("setting")} onChange={(next) => set("setting", next)} />
        </Field>

        <Field id={`${p}-note`} label="Context note (optional)" hint={`${NOTE_HINT}. Only you can see this.`} error={errors.note} className="md:col-span-2">
          <textarea
            id={`${p}-note`}
            rows={2}
            maxLength={NOTE_MAX}
            value={values.note}
            onChange={(e) => set("note", e.target.value)}
            aria-invalid={Boolean(errors.note)}
            aria-describedby={describe("note")}
            placeholder="When it is used, a similar sign, a spelling to remember"
            className={inputClass}
          />
        </Field>
      </div>

      {formError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-800">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="min-h-11 flex-1 rounded-full bg-[var(--forest)] px-6 text-[14px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 sm:min-h-10 sm:flex-none">
          {saving ? "Saving..." : editingId ? "Save changes" : "Save term"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 flex-1 rounded-full border border-gray-200 bg-white px-6 text-[14px] font-medium text-gray-700 hover:bg-gray-50 sm:min-h-10 sm:flex-none">
          Cancel
        </button>
      </div>
    </form>
  );
}
