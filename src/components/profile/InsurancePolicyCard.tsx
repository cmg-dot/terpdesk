"use client";

import { useState } from "react";
import { Car, ShieldCheck } from "lucide-react";
import { removeInsurance } from "@/app/actions/insurance";
import { CredentialFileUpload } from "@/components/profile/CredentialFileUpload";
import { InsuranceForm } from "@/components/profile/InsuranceForm";
import { actionButton, badgeBase, expiryStatus, formatDay } from "@/components/profile/credentialFormat";
import { COMMERCIAL_AUTO_BADGE, COMMERCIAL_AUTO_PAYOUT, INSURANCE_LABEL, hasValidCommercialAuto } from "@/lib/insurance";
import type { InsuranceKind, InsurancePolicy, MyInsurance } from "@/lib/insurance";
import type { CredentialFile } from "@/lib/validation/file";

interface Props {
  kind: InsuranceKind;
  policy: InsurancePolicy | null;
  timeZone: string;
  onChange: (insurance: MyInsurance) => void;
  onFilesChange: (files: CredentialFile[]) => void;
}

const INTRO: Record<InsuranceKind, string> = {
  liability: "Professional liability coverage. Your agency checks it is current before booking you.",
  commercial_auto: `Optional. ${COMMERCIAL_AUTO_PAYOUT}`,
};

/** One dedicated policy on the Credentials tab: its details, expiry, document upload, and edit / remove. */
export function InsurancePolicyCard({ kind, policy, timeZone, onChange, onFilesChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = kind === "liability" ? ShieldCheck : Car;
  const status = policy ? expiryStatus(policy.expirationDate, timeZone) : null;

  const remove = async () => {
    const result = await removeInsurance(kind).catch(() => null);
    if (result?.success) {
      onChange(result.insurance);
      setConfirmingRemove(false);
    } else setError(result && !result.success ? result.error : "We could not remove this policy. Please try again.");
  };

  return (
    <section className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-5" data-insurance-section={kind}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[16px] font-semibold text-[var(--ink)]">
            <Icon className="h-4 w-4 text-[var(--forest)]" aria-hidden="true" />
            {INSURANCE_LABEL[kind]}
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--sage)]">{INTRO[kind]}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status && <span className={`${badgeBase} ${status.className}`}>{status.label}</span>}
          {kind === "commercial_auto" && hasValidCommercialAuto(policy, timeZone) && (
            <span className={`${badgeBase} border-emerald-200 bg-emerald-50 text-emerald-800`}>{COMMERCIAL_AUTO_BADGE}</span>
          )}
        </div>
      </div>

      {editing ? (
        <InsuranceForm kind={kind} initial={policy} onCancel={() => setEditing(false)} onSaved={(next) => { onChange(next); setEditing(false); }} />
      ) : policy ? (
        <>
          <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
            <div><dt className="inline text-[var(--sage)]">Insurer: </dt><dd className="inline text-[var(--ink)]">{policy.insurer}</dd></div>
            {policy.policyNumber && <div><dt className="inline text-[var(--sage)]">Policy no.: </dt><dd className="inline text-[var(--ink)]">{policy.policyNumber}</dd></div>}
            {policy.coverageLimits && <div><dt className="inline text-[var(--sage)]">Limits: </dt><dd className="inline text-[var(--ink)]">{policy.coverageLimits}</dd></div>}
            <div><dt className="inline text-[var(--sage)]">Expires: </dt><dd className="inline text-[var(--ink)]">{formatDay(policy.expirationDate)}</dd></div>
          </dl>
          {confirmingRemove ? (
            <div role="alertdialog" aria-label={`Remove ${INSURANCE_LABEL[kind]}?`} className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-gray-700">Remove this policy? Your agency will no longer see it or its document.</span>
              <button type="button" onClick={remove} className="rounded-full bg-[var(--forest)] px-4 py-1.5 text-xs font-medium text-white">Yes, remove</button>
              <button type="button" onClick={() => setConfirmingRemove(false)} className={actionButton}>Cancel</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(true)} className={actionButton}>Edit</button>
              <button type="button" onClick={() => setConfirmingRemove(true)} className={actionButton}>Remove</button>
            </div>
          )}
          <CredentialFileUpload credentialId={policy.credentialId} files={policy.files} onFilesChange={onFilesChange} />
        </>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="rounded-full bg-[var(--forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--forest-hover)]">
          Add {INSURANCE_LABEL[kind].toLowerCase()}
        </button>
      )}
      {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}
    </section>
  );
}
