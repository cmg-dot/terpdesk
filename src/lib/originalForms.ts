/**
 * The state's own emails for one job, as the "View original form" panel lists them. Pure types and a classifier: safe in
 * client components. The emails themselves come from the Inbox (see app/actions/originalForms.ts).
 */

export type FormKind = "request_form" | "booking_notice" | "cancellation" | "reassignment" | "in_process" | "hours_report" | "other";

export const FORM_LABELS: Record<FormKind, string> = {
  request_form: "Request form",
  booking_notice: "Booking notice",
  cancellation: "Cancellation",
  reassignment: "Reassignment",
  in_process: "In process",
  hours_report: "Hours report",
  other: "Email",
};

/** The order the tabs appear in: the form first, then what happened to the job. */
const KIND_ORDER: FormKind[] = ["request_form", "in_process", "booking_notice", "reassignment", "cancellation", "hours_report", "other"];

export interface OriginalFormEmail {
  id: string;
  kind: FormKind;
  label: string;
  subject: string;
  /** ISO instant. */
  receivedAt: string;
  bodyText: string;
  /** Raw HTML as received; the panel sanitizes it before showing it. Null when there is none (or it was too large). */
  bodyHtml: string | null;
  /** True for the copy terpDESK saved on the job when it created it from an email (not from the Inbox). */
  savedCopy?: boolean;
}

export type OriginalFormsResult = { success: true; srn: string | null; emails: OriginalFormEmail[] } | { success: false; error: string };

/** What kind of state email this is, from its subject and text. */
export function classifyStateEmail(subject: string, text: string): FormKind {
  const s = subject.toLowerCase();
  if (/slicr|assignment report|service verification/.test(s) || /SERVICE VERIFICATION/.test(text)) return "hours_report";
  if (/cancell?ation/.test(s)) return "cancellation";
  if (/reassignment/.test(s)) return "reassignment";
  if (/\bbooking\b/.test(s)) return "booking_notice";
  if (/now in process/.test(s)) return "in_process";
  if (/APPOINTMENT LOCATION/.test(text) || /interpreter request/.test(s)) return "request_form";
  return "other";
}

/** Request form first, then by arrival time. */
export function sortOriginalForms(emails: readonly OriginalFormEmail[]): OriginalFormEmail[] {
  return [...emails].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.receivedAt.localeCompare(b.receivedAt));
}
