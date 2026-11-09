"use client";

import { setClientName } from "@/app/actions/setClientName";
import { QuickSaveField } from "@/components/requests/staffing/QuickSaveField";
import { CLIENT_NAME_MAX } from "@/lib/validation/clientName";

interface Props {
  requestId: string;
  /** The name saved on the job (details.deafParticipant); empty when there is none. */
  value: string;
  /** Called with the saved name so the page can keep its copy of the job in step. */
  onSaved: (clientName: string) => void;
}

/**
 * An optional "Client" box at the top of Staffing: the dispatcher types the client's name while booking and saves it right
 * here (Save, or Enter), without opening Edit assignment, which is locked while an offer is out or an interpreter is booked.
 * Shared with an interpreter only once they are booked on the job (never on an offer that has not been accepted, and never in
 * an email). Clearing the box and saving removes the name.
 */
export function ClientNameField({ requestId, value, onSaved }: Props) {
  return (
    <QuickSaveField
      label="Client"
      note="(optional, shared with interpreters once they are booked)"
      placeholder="Client's name"
      maxLength={CLIENT_NAME_MAX}
      value={value}
      save={async (clientName) => {
        const result = await setClientName({ requestId, clientName });
        return result.success ? { success: true, value: result.clientName } : result;
      }}
      onSaved={onSaved}
      savedText="Client name saved."
      clearedText="Client name removed."
      dataAttribute="data-client-name-field"
      failureText="We could not save the client name. Please try again."
    />
  );
}
