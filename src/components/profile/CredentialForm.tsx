"use client";

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { addCredential, updateCredential } from "@/app/actions/credentials";
import { Field, FormCard, inputClass } from "@/components/profile/formParts";
import { CREDENTIAL_TYPES, credentialSchema } from "@/lib/validation/credential";
import type { CredentialField, CredentialInput, MyCredential } from "@/lib/validation/credential";

type FieldErrors = Partial<Record<CredentialField, string>>;

const EMPTY: CredentialInput = {
  name: "",
  type: "Certification",
  issuedBy: "",
  credentialNumber: "",
  issueDate: "",
  expirationDate: "",
  notes: "",
};

interface CredentialFormProps {
  /** The credential being edited; omit to add a new one. */
  initial?: MyCredential;
  onSaved: (credential: MyCredential) => void;
  onCancel: () => void;
}

const toInput = (c: MyCredential): CredentialInput => ({
  name: c.name,
  type: c.type,
  issuedBy: c.issuedBy,
  credentialNumber: c.credentialNumber,
  issueDate: c.issueDate,
  expirationDate: c.expirationDate,
  notes: c.notes,
});

/** "Add a credential" / edit form. Layout: name/type, issued by/number, issue/expiration date, then notes. */
export const CredentialForm = ({ initial, onSaved, onCancel }: CredentialFormProps) => {
  const [values, setValues] = useState<CredentialInput>(() => (initial ? toInput(initial) : EMPTY));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const bind = (field: CredentialField) => ({
    id: `credential-${field}`,
    value: values[field],
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": errors[field] ? `credential-${field}-error` : undefined,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [field]: e.target.value })),
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);

    const check = credentialSchema.safeParse(values);
    if (!check.success) {
      const next: FieldErrors = {};
      for (const issue of check.error.issues) {
        const field = issue.path[0] as CredentialField | undefined;
        if (field && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      setFormError("Please fix the highlighted fields.");
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const result = initial ? await updateCredential(initial.id, values) : await addCredential(values);
      if (result.success) {
        onSaved(result.credential);
      } else {
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
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormCard title={initial ? "Edit credential" : "Add a credential"}>
        <Field id="credential-name" label="Name" error={errors.name}>
          <input type="text" placeholder="For example: NIC Certification" className={inputClass} {...bind("name")} />
        </Field>
        <Field id="credential-type" label="Type" error={errors.type}>
          <select className={inputClass} {...bind("type")}>
            {CREDENTIAL_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field id="credential-issuedBy" label="Issued by (optional)" error={errors.issuedBy}>
          <input type="text" className={inputClass} {...bind("issuedBy")} />
        </Field>
        <Field id="credential-credentialNumber" label="Credential number (optional)" error={errors.credentialNumber}>
          <input type="text" className={inputClass} {...bind("credentialNumber")} />
        </Field>
        <Field id="credential-issueDate" label="Issue date (optional)" error={errors.issueDate}>
          <input type="date" className={inputClass} {...bind("issueDate")} />
        </Field>
        <Field id="credential-expirationDate" label="Expiration date (optional)" hint="Leave blank if it doesn't expire." error={errors.expirationDate}>
          <input type="date" className={inputClass} {...bind("expirationDate")} />
        </Field>
        <Field id="credential-notes" label="Notes (optional)" error={errors.notes} className="md:col-span-2">
          <textarea rows={3} className={inputClass} {...bind("notes")} />
        </Field>
      </FormCard>

      {formError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{formError}</p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-full border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[#0B3B32] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#082a23] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Add credential"}
        </button>
      </div>
    </form>
  );
};
