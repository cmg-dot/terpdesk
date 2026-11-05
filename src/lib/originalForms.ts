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

/**
 * The panel's answer: the request form(s) the state sent, and, apart from them, the notices that followed (booking,
 * reassignment, cancellation, "now in process"). Hours reports (SLICR / service verification) are never included: they
 * belong to Hours review, and they are not the form.
 */
export type OriginalFormsResult = { success: true; srn: string | null; forms: OriginalFormEmail[]; related: OriginalFormEmail[] } | { success: false; error: string };

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

/** Notices that followed the form: shown under "Related state emails (not the form)". */
export const RELATED_KINDS: readonly FormKind[] = ["in_process", "booking_notice", "reassignment", "cancellation"];

/** True when `text` holds this exact SRN as a whole number (not part of a longer run of digits). */
export const mentionsSrn = (text: string, srn: string): boolean => new RegExp(`(^|[^0-9])${srn}([^0-9]|$)`).test(text);

const byArrival = (a: OriginalFormEmail, b: OriginalFormEmail): number => a.receivedAt.localeCompare(b.receivedAt);

/** Request forms (oldest first) and the related notices. Hours reports and anything unrecognised are dropped. */
export function splitOriginalForms(emails: readonly OriginalFormEmail[]): { forms: OriginalFormEmail[]; related: OriginalFormEmail[] } {
  return {
    forms: emails.filter((e) => e.kind === "request_form").sort(byArrival),
    related: emails.filter((e) => RELATED_KINDS.includes(e.kind)).sort(byArrival),
  };
}
