"use client";

import { setProviderOne } from "@/app/actions/setBillingFields";
import { QuickSaveField } from "@/components/requests/staffing/QuickSaveField";
import { PROVIDER_ONE_MAX, providerOneWarning } from "@/lib/providerOne";

interface Props {
  requestId: string;
  /** The number saved on the job (intake.providerOneNumber); empty when there is none. */
  value: string;
  /** For older jobs with nothing saved: the number on the state's form (Section 5), offered until someone saves. */
  suggested: string;
  /** Called with the saved number so the page can keep its copy of the job in step. */
  onSaved: (providerOne: string) => void;
}

/**
 * The client's "WA #" (ProviderOne number) in Staffing, saved like the other billing boxes (Save, or Enter). Spaces and hyphens are
 * dropped and letters upper-cased; a value that is not 9 digits + WA is flagged but still saved. AGENCY ONLY: never shown to
 * interpreters or put in an email, and the number itself is never written to a log.
 */
export function ProviderOneField({ requestId, value, suggested, onSaved }: Props) {
  return (
    <QuickSaveField
      label="Client WA #"
      note="(ProviderOne, agency billing only)"
      placeholder="e.g. 123456789WA"
      maxLength={PROVIDER_ONE_MAX}
      value={value}
      suggested={suggested}
      warn={providerOneWarning}
      save={async (providerOne) => {
        const result = await setProviderOne({ requestId, providerOne });
        return result.success ? { success: true, value: result.providerOne } : result;
      }}
      onSaved={onSaved}
      savedText="Client WA # saved."
      clearedText="Client WA # removed."
      dataAttribute="data-provider-one-field"
      failureText="We could not save the WA #. Please try again."
    />
  );
}
