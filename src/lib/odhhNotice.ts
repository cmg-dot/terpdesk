import { classifyStateEmail } from "@/lib/originalForms";
import type { FormKind } from "@/lib/originalForms";

/**
 * The state also sends NOTICES about a request: a booking confirmation, "now in process", a reassignment, a cancellation, an
 * hours report. They carry the request number but are not the request form, so they must never create a job (a booking notice
 * names no appointment date or times). Pure.
 */
const NOTICE_KINDS: readonly FormKind[] = ["booking_notice", "in_process", "reassignment", "cancellation", "hours_report"];

/**
 * The kind of state notice an email is, or null when it should be treated as a request form. An email that states an
 * "Appointment Date" is always read as a form, whatever its subject says, so a real form is never mistaken for a notice.
 */
export function stateNoticeKind(subject: string, rawContent: string, statesAppointmentDate: boolean): FormKind | null {
  if (statesAppointmentDate) return null;
  const kind = classifyStateEmail(subject, rawContent);
  return NOTICE_KINDS.includes(kind) ? kind : null;
}
