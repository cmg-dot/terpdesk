"use client";

import { setPriorAuth } from "@/app/actions/setPriorAuth";
import { QuickSaveField } from "@/components/requests/staffing/QuickSaveField";
import { PRIOR_AUTH_MAX } from "@/lib/validation/priorAuth";

interface Props {
  requestId: string;
  /** The number saved on the job (intake.priorAuthNumber); empty when there is none. */
  value: string;
  /** Called with the saved number so the page can keep its copy of the job in step. */
  onSaved: (priorAuth: string) => void;
}

/**
 * The "Prior authorization #" box next to Client in Staffing, saved the same way (Save, or Enter) so the dispatcher does not
 * have to edit the job to record it. AGENCY ONLY: it is never shown to interpreters or put in an email.
 */
export function PriorAuthField({ requestId, value, onSaved }: Props) {
  return (
    <QuickSaveField
      label="Prior authorization #"
      note="(optional, agency only)"
      placeholder="e.g. PA-123456"
      maxLength={PRIOR_AUTH_MAX}
      value={value}
      save={async (priorAuth) => {
        const result = await setPriorAuth({ requestId, priorAuth });
        return result.success ? { success: true, value: result.priorAuth } : result;
      }}
      onSaved={onSaved}
      savedText="Prior authorization number saved."
      clearedText="Prior authorization number removed."
      dataAttribute="data-prior-auth-field"
      failureText="We could not save the prior authorization number. Please try again."
    />
  );
}
