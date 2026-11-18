"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Car } from "lucide-react";
import { removeStaffCommercialAuto, saveStaffCommercialAuto } from "@/app/actions/staffInsurance";
import { deleteStaffCredentialFile, presignStaffCredentialFile, saveStaffCredentialFile } from "@/app/actions/staffInsuranceFiles";
import { CredentialFileUpload } from "@/components/profile/CredentialFileUpload";
import type { CredentialFileActions } from "@/components/profile/CredentialFileUpload";
import { actionButton, badgeBase, expiryStatus, formatDay } from "@/components/profile/credentialFormat";
import { Field, inputClass } from "@/components/profile/formParts";
import { IconInput } from "@/components/ui/IconInput";
import { COMMERCIAL_AUTO_BADGE, COMMERCIAL_AUTO_PAYOUT, hasValidCommercialAuto } from "@/lib/insurance";
import type { InsurancePolicy, StaffCommercialAutoField } from "@/lib/insurance";
import type { CredentialFile } from "@/lib/validation/file";

type Values = Record<StaffCommercialAutoField, string>;

/**
 * Agency only, for an interpreter with no terpDESK login: staff record their commercial auto policy (expiration date, limits,
 * insurer, and the document), so the +$10 on in-person State and Apple Health jobs reaches them. An interpreter with a login keeps
 * theirs on their own profile, and this card is not shown for them.
 */
export function StaffCommercialAutoCard({ interpreterId, name, timeZone, initial }: { interpreterId: string; name: string; timeZone: string; initial: InsurancePolicy | null }) {
  const [policy, setPolicy] = useState<InsurancePolicy | null>(initial);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Values>({ expirationDate: "", coverageLimits: "", insurer: "" });
  const [errors, setErrors] = useState<Partial<Values>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const status = policy ? expiryStatus(policy.expirationDate, timeZone) : null;

  const fileActions: CredentialFileActions = {
    presign: (input) => presignStaffCredentialFile({ interpreterId, ...input }),
    save: (input) => saveStaffCredentialFile({ interpreterId, ...input }),
    remove: (fileId) => deleteStaffCredentialFile({ interpreterId, fileId }),
  };

  const startEdit = () => {
    setValues({ expirationDate: policy?.expirationDate ?? "", coverageLimits: policy?.coverageLimits ?? "", insurer: policy?.insurer ?? "" });
    setErrors({});
    setMessage(null);
    setEditing(true);
  };

  const run = async (save: boolean) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = save ? await saveStaffCommercialAuto({ interpreterId, ...values }) : await removeStaffCommercialAuto({ interpreterId });
      if (result.success) {
        setPolicy(result.policy);
        setEditing(false);
        setMessage({ ok: true, text: save ? "Policy saved." : "Policy removed." });
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage({ ok: false, text: result.error });
      }
    } catch {
      setMessage({ ok: false, text: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(true);
  };
  const set = (field: StaffCommercialAutoField) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6" data-staff-commercial-auto="">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--ink)]">
            <Car className="h-4 w-4 text-[var(--forest)]" aria-hidden="true" />
            Commercial auto insurance
          </h2>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {name} has no terpDESK login, so the agency records their policy here. {COMMERCIAL_AUTO_PAYOUT}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status && <span className={`${badgeBase} ${status.className}`}>{status.label}</span>}
          {hasValidCommercialAuto(policy, timeZone) && <span className={`${badgeBase} border-emerald-200 bg-emerald-50 text-emerald-800`}>{COMMERCIAL_AUTO_BADGE}</span>}
        </div>
      </div>

      {editing ? (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field id="staff-auto-expires" label="Expiration date" error={errors.expirationDate}>
              <IconInput kind="date" id="staff-auto-expires" value={values.expirationDate} onChange={(e) => set("expirationDate")(e.target.value)} aria-invalid={Boolean(errors.expirationDate)} className={inputClass} />
            </Field>
            <Field id="staff-auto-limits" label="Policy limits (optional)" error={errors.coverageLimits}>
              <input id="staff-auto-limits" value={values.coverageLimits} maxLength={200} placeholder="$1,000,000 / $2,000,000" onChange={(e) => set("coverageLimits")(e.target.value)} className={inputClass} />
            </Field>
            <Field id="staff-auto-insurer" label="Insurer (optional)" error={errors.insurer}>
              <input id="staff-auto-insurer" value={values.insurer} maxLength={150} onChange={(e) => set("insurer")(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="rounded-full bg-[var(--forest)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--forest-hover)] disabled:opacity-60">
              {busy ? "Saving…" : "Save policy"}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={busy} className={actionButton}>
              Cancel
            </button>
          </div>
        </form>
      ) : policy ? (
        <div className="space-y-4">
          <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-3">
            <div><dt className="inline text-[var(--sage)]">Expires: </dt><dd className="inline text-[var(--ink)]">{formatDay(policy.expirationDate)}</dd></div>
            {policy.coverageLimits && <div><dt className="inline text-[var(--sage)]">Limits: </dt><dd className="inline text-[var(--ink)]">{policy.coverageLimits}</dd></div>}
            {policy.insurer && <div><dt className="inline text-[var(--sage)]">Insurer: </dt><dd className="inline text-[var(--ink)]">{policy.insurer}</dd></div>}
          </dl>
          <div className="flex gap-2">
            <button type="button" onClick={startEdit} className={actionButton}>Edit</button>
            <button type="button" onClick={() => void run(false)} disabled={busy} className={actionButton}>Remove</button>
          </div>
          <CredentialFileUpload
            credentialId={policy.credentialId}
            files={policy.files}
            onFilesChange={(next: CredentialFile[]) => setPolicy((p) => (p ? { ...p, files: next } : p))}
            actions={fileActions}
            privacyNote="Stored privately: only agency staff (and the interpreter, if they later sign in) can open them."
          />
        </div>
      ) : (
        <button type="button" onClick={startEdit} className="rounded-full bg-[var(--forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--forest-hover)]">
          Record a commercial auto policy
        </button>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mt-3 text-sm font-medium ${message.ok ? "text-emerald-700" : "text-red-700"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
