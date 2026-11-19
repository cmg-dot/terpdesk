import { handleStateNotice } from "@/lib/inboundMail/handle";
import type { InboundKind } from "@/lib/inboundMail/classify";
import { noteInboxHoursReport } from "@/lib/inboxHoursReport";
import { extractSrn } from "@/lib/inboxSrn";
import { logError } from "@/lib/logError";
import { processJobOfferEmail } from "@/lib/odhhIntakeProcess";
import { markInboxMail } from "@/lib/stateEvents";
import { resolveIntakeType } from "@/lib/odhhVerificationParser";

/**
 * Mail that reaches the agency Inbox (for example Kari forwarding a state request form) gets the same treatment as mail that
 * reaches /api/intake. The state's own notices (void, cancellation, "now in process") and a requester's reply are acted on by
 * handleStateNotice (see inboundMail/handle.ts). What is left is the request form: a form for a job we know fills that job's BLANK
 * fields; a form for a new SRN becomes a draft job. Only mail that is plainly the state's form is acted on (see odhhFormGate.ts),
 * because the Inbox accepts mail from anyone. Everything else stays in the Inbox, untouched.
 *
 * What was decided is saved on the stored email (kind, request number, outcome), every time, so staff can see why nothing happened:
 * an hours report ("hours_report", or "hours_no_job" with an alert when no job has its number), a state notice that is not the form
 * ("notice_only"), anything else ("skipped").
 * Never throws: the email is already stored, and a failure here must not make the webhook answer 500 (SNS would redeliver).
 * Safe to repeat: a form already applied changes nothing. SERVER ONLY.
 */
export interface InboxMail {
  senderEmail: string;
  subject: string;
  bodyText: string | null;
  /** SES vouched for the sender (DKIM/DMARC passed). Needed before a notice may void or cancel a job. */
  authenticated?: boolean;
  /** The stored email's Message-ID, so the outcome can be saved on it. */
  messageId?: string;
  receivedAt?: Date;
}

export type InboxIngestResult =
  | "created"
  | "filled"
  | "unchanged"
  | "skipped"
  | "failed"
  | "voided"
  | "void_held"
  | "void_ignored"
  | "cancelled"
  | "cancel_held"
  | "returned"
  | "unable_held"
  | "flagged"
  | "noted"
  | "no_job"
  | "hours_report"
  | "hours_no_job"
  | "notice_only";

const NOTICE_WARNING = "A state notice, not a request form";

export async function ingestInboxStateForm(mail: InboxMail): Promise<InboxIngestResult> {
  const text = mail.bodyText ?? "";
  const handled = await handleStateNotice({ senderEmail: mail.senderEmail, subject: mail.subject, bodyText: text, authenticated: mail.authenticated === true, messageId: mail.messageId ?? null, receivedAt: mail.receivedAt ?? new Date() });
  if (handled) return handled.result as InboxIngestResult;

  const finish = async (result: InboxIngestResult, requestId: string | null, kind: InboundKind = "state_request_form", srn: string | null = null): Promise<InboxIngestResult> => {
    if (mail.messageId) await markInboxMail(mail.messageId, { kind, srn, outcome: result, requestId });
    return result;
  };
  // Service-verification receipts (hours) are a different flow: they are never read as a job request here.
  if (resolveIntakeType(undefined, text) !== "job_offer") {
    const report = await noteInboxHoursReport(mail.subject, text);
    return finish(report.outcome, report.requestId, "hours_report", report.srn);
  }
  try {
    const result = await processJobOfferEmail({ email: mail.senderEmail, subject: mail.subject, rawContent: text, strict: true });
    if (result.outcome === "not_a_job") {
      return finish(result.warnings.includes(NOTICE_WARNING) ? "notice_only" : "skipped", null, "other", extractSrn(mail.subject, text));
    }
    if (result.outcome === "created") return finish("created", result.id);
    return finish(result.filled.length > 0 ? "filled" : "unchanged", result.id);
  } catch (error) {
    logError("Inbox form ingest", error);
    return "failed";
  }
}
