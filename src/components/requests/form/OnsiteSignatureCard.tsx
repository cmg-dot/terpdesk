"use client";

import { cardClass, sectionTitleClass } from "@/components/requests/form/formStyles";
import { OnsiteSignatureToggle } from "@/components/requests/OnsiteSignatureToggle";
import { isStateProgram } from "@/lib/stateJob";

interface Props {
  program: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Hours are already on the job, so the setting is frozen (it would no longer match what was signed). */
  locked?: boolean;
}

/** The request forms' "Hours verification" card. Not shown for a state program: those hours are reported in the state portal. */
export function OnsiteSignatureCard({ program, checked, onChange, locked = false }: Props) {
  if (isStateProgram(program)) return null;
  return (
    <div className={cardClass} data-form-card="onsite-signature">
      <h2 className={sectionTitleClass}>Hours verification</h2>
      <OnsiteSignatureToggle id="request-onsite-signature" checked={checked} disabled={locked} onChange={onChange} />
      {locked && <p className="text-xs text-gray-400">Hours have already been submitted for this job, so this setting can no longer change.</p>}
    </div>
  );
}
