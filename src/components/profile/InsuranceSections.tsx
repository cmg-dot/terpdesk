"use client";

import type { Dispatch, SetStateAction } from "react";
import { InsurancePolicyCard } from "@/components/profile/InsurancePolicyCard";
import { INSURANCE_KINDS } from "@/lib/insurance";
import type { InsuranceKind, MyInsurance } from "@/lib/insurance";
import type { CredentialFile } from "@/lib/validation/file";

interface Props {
  insurance: MyInsurance;
  /** A state setter (the profile page keeps the policies while tabs switch). */
  onChange: Dispatch<SetStateAction<MyInsurance>>;
  timeZone: string;
}

/** "Insurance" on the Credentials tab: Liability, then the optional Commercial Auto, each with its own document. */
export function InsuranceSections({ insurance, onChange, timeZone }: Props) {
  const setFiles = (kind: InsuranceKind) => (files: CredentialFile[]) =>
    onChange((current) => {
      const policy = current[kind];
      return policy ? { ...current, [kind]: { ...policy, files } } : current;
    });

  return (
    <section aria-labelledby="insurance-heading" className="space-y-4">
      <h2 id="insurance-heading" className="text-lg font-semibold text-[var(--ink)]">Insurance</h2>
      {INSURANCE_KINDS.map((kind) => (
        <InsurancePolicyCard key={kind} kind={kind} policy={insurance[kind]} timeZone={timeZone} onChange={onChange} onFilesChange={setFiles(kind)} />
      ))}
    </section>
  );
}
