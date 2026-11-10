"use client";

import { setClientDob } from "@/app/actions/setBillingFields";
import { QuickSaveField } from "@/components/requests/staffing/QuickSaveField";
import { DOB_MAX_INPUT, formatDob, parseDob } from "@/lib/validation/billingFields";

interface Props {
  requestId: string;
  /** The date saved on the job (intake.clientDob, yyyy-MM-dd); empty when there is none. */
  value: string;
  /** Called with the saved date (yyyy-MM-dd, or empty) so the page can keep its copy of the job in step. */
  onSaved: (clientDob: string) => void;
}

/**
 * The "Client date of birth" box next to the client's name in Staffing: type MM/DD/YYYY and it saves as soon as you leave the box
 * (or press Enter or Save), without opening Edit assignment, which is locked while an offer is out or an interpreter is booked. For
 * agency billing only: it is never shown to interpreters or put in an email, a link or a notification. Clearing the box removes it.
 */
export function ClientDobField({ requestId, value, onSaved }: Props) {
  return (
    <QuickSaveField
      label="Client date of birth"
      note="(optional, agency billing only)"
      placeholder="MM/DD/YYYY"
      maxLength={DOB_MAX_INPUT}
      value={formatDob(value)}
      save={async (clientDob) => {
        const result = await setClientDob({ requestId, clientDob });
        return result.success ? { success: true, value: formatDob(result.clientDob) } : result;
      }}
      onSaved={(shown) => onSaved(parseDob(shown) ?? "")}
      savedText="Client date of birth saved."
      clearedText="Client date of birth removed."
      dataAttribute="data-client-dob-field"
      failureText="We could not save the date of birth. Please try again."
      saveOnBlur
    />
  );
}
