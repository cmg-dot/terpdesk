"use client";

import { useId, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Paperclip } from "lucide-react";
import { presignCredentialFile, saveCredentialFile } from "@/app/actions/credentialFiles";
import { saveInsurance } from "@/app/actions/insurance";
import { actionButton } from "@/components/profile/credentialFormat";
import { checkCredentialFile, uploadCredentialFile } from "@/components/profile/uploadCredentialFile";
import { IconInput } from "@/components/ui/IconInput";
import { INSURANCE_LABEL, insuranceSchema } from "@/lib/insurance";
import type { InsuranceField, InsuranceKind, InsurancePolicy, MyInsurance } from "@/lib/insurance";

interface Props {
  kind: InsuranceKind;
  initial: InsurancePolicy | null;
  onCancel: () => void;
  /** `notice` is set when the policy saved but its document did not upload (the card shows it and offers the upload box). */
  onSaved: (insurance: MyInsurance, notice?: string) => void;
}

const BOX = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.2)] aria-[invalid=true]:border-red-400";
const FIELDS: { key: InsuranceField; label: string; type?: "date"; placeholder?: string }[] = [
  { key: "insurer", label: "Insurance company" },
  { key: "policyNumber", label: "Policy number (optional)" },
  { key: "coverageLimits", label: "Policy limits (optional)", placeholder: "e.g. $1,000,000 per occurrence / $2,000,000 aggregate" },
  { key: "expirationDate", label: "Expiration date", type: "date" },
];

/**
 * Add or edit one insurance policy. The same Zod schema checks it here (instant) and on the server (the real check). When adding, the
 * policy document (certificate of insurance) can be chosen here too: it uploads right after the policy saves.
 */
export function InsuranceForm({ kind, initial, onCancel, onSaved }: Props) {
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
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
    if (!result?.success) {
      setSaving(false);
      setErrors(result && !result.success ? result.fieldErrors ?? {} : {});
      setFormError(result && !result.success ? result.error : "We could not save this policy. Please try again.");
      return;
    }
    let insurance = result.insurance;
    let notice: string | undefined;
    const policy = insurance[kind];
    if (file && policy) {
      const outcome = await uploadCredentialFile({ presign: presignCredentialFile, save: saveCredentialFile }, policy.credentialId, file, setUploadStatus);
      if (outcome.ok) insurance = { ...insurance, [kind]: { ...policy, files: [outcome.file, ...policy.files] } };
      else notice = `Your policy was saved, but the document was not uploaded: ${outcome.error} Add it below.`;
    }
    setSaving(false);
    onSaved(insurance, notice);
  };

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0] ?? null;
    e.target.value = "";
    const problem = chosen ? checkCredentialFile(chosen) : null;
    setFileError(problem);
    setFile(problem ? null : chosen);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <h3 className="text-[15px] font-semibold text-[var(--ink)]">{initial ? "Edit" : "Add"} {INSURANCE_LABEL[kind].toLowerCase()}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => {
          const id = `insurance-${kind}-${f.key}`;
          const error = errors[f.key];
          const set = (value: string) => setValues((v) => ({ ...v, [f.key]: value }));
          return (
            <div key={f.key} className="text-xs font-medium text-[var(--sage)]">
              <label htmlFor={id}>{f.label}</label>
              {f.type === "date" ? (
                // The app's calendar picker (no earliest date: an expired policy can be recorded, and then warns).
                <IconInput
                  kind="date"
                  id={id}
                  value={values[f.key]}
                  onChange={(e) => set(e.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${id}-error` : undefined}
                  className={BOX}
                  wrapperClassName="relative mt-1 w-full min-w-0"
                />
              ) : (
                <input
                  id={id}
                  type="text"
                  value={values[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => set(e.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${id}-error` : undefined}
                  className={`mt-1 ${BOX}`}
                />
              )}
              {error && <span id={`${id}-error`} className="mt-1 block text-[11px] text-red-700">{error}</span>}
            </div>
          );
        })}
      </div>
      {!initial && (
        <div className="text-xs font-medium text-[var(--sage)]">
          <span id={`${fileId}-caption`}>Policy document (certificate of insurance, optional)</span>
          <input id={fileId} type="file" accept="application/pdf, image/jpeg, image/png" onChange={choose} disabled={saving} aria-describedby={`${fileId}-caption`} className="sr-only" />
          <label
            htmlFor={fileId}
            className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-[var(--accent-text)] transition-colors hover:border-[var(--forest)] focus-within:ring-2 focus-within:ring-[rgb(var(--forest-rgb)/0.4)]"
          >
            <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{file ? file.name : "Choose a file"}</span>
          </label>
          <span className="mt-1 block text-[11px] font-normal">PDF, JPEG or PNG, up to 10 MB. It is uploaded when you save.</span>
          {fileError && <span role="alert" className="mt-1 block text-[11px] text-red-700">{fileError}</span>}
        </div>
      )}
      {formError && <p role="alert" className="text-[12px] text-red-700">{formError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-full bg-[var(--forest)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--forest-hover)] disabled:opacity-60">
          {saving ? uploadStatus ?? "Saving…" : "Save policy"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={actionButton}>Cancel</button>
      </div>
      {initial && <p className="text-[12px] text-[var(--sage)]">Policy documents are managed below.</p>}
    </form>
  );
}
