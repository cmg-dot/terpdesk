"use client";

import { useEffect, useRef } from "react";
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
  /** Saving the liability policy also sets the profile's liability date on the server; the page keeps its copy in step. */
  onLiabilityDate: (date: string) => void;
  /** Set when the interpreter came from the Overview's "Add your policy document" link: scroll here and move focus to the heading. */
  revealOnMount?: boolean;
}

/** "Insurance" on the Credentials tab: Liability, then the optional Commercial Auto, each with its own document. */
export function InsuranceSections({ insurance, onChange, timeZone, onLiabilityDate, revealOnMount = false }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!revealOnMount) return;
    heading.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [revealOnMount]);
  const changed = (kind: InsuranceKind) => (next: MyInsurance) => {
    onChange(next);
    // The liability card reports a save (its policy is there) or a removal (none, and the server leaves the profile date alone).
    const date = kind === "liability" ? next.liability?.expirationDate : undefined;
    if (date) onLiabilityDate(date);
  };
  const setFiles = (kind: InsuranceKind) => (files: CredentialFile[]) =>
    onChange((current) => {
      const policy = current[kind];
      return policy ? { ...current, [kind]: { ...policy, files } } : current;
    });

  return (
    <section aria-labelledby="insurance-heading" className="space-y-4">
      <h2 id="insurance-heading" ref={heading} tabIndex={-1} className="scroll-mt-24 text-lg font-semibold text-[var(--ink)] outline-none">Insurance</h2>
      {INSURANCE_KINDS.map((kind) => (
        <InsurancePolicyCard key={kind} kind={kind} policy={insurance[kind]} timeZone={timeZone} onChange={changed(kind)} onFilesChange={setFiles(kind)} />
      ))}
    </section>
  );
}
