import { handleStateNotice } from "@/lib/inboundMail/handle";
import { logError } from "@/lib/logError";
import { processJobOfferEmail } from "@/lib/odhhIntakeProcess";
import { markInboxMail } from "@/lib/stateEvents";
import { resolveIntakeType } from "@/lib/odhhVerificationParser";

/**
 * Mail that reaches the agency Inbox (for example Kari forwarding a state request form) gets the same treatment as mail that
 * reaches /api/intake. The state's own notices (void, cancellation, "now in process") and a requester's reply are acted on by
 * handleStateNotice (see inboundMail/handle.ts). What is left is the request form: a form for a job we know fills that job's BLANK
 * fields; a form for a new SRN becomes a draft job. Only mail that is plainly the state's form is acted on (an SRN plus the state's
 * own portal link for it), because the Inbox accepts mail from anyone. Everything else stays in the Inbox, untouched.
 *
 * What was decided is saved on the stored email (kind, request number, outcome), so staff can see why nothing happened.
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

export type InboxIngestResult = "created" | "filled" | "unchanged" | "skipped" | "failed" | "voided" | "void_held" | "void_ignored" | "cancelled" | "cancel_held" | "flagged" | "noted" | "no_job";

export async function ingestInboxStateForm(mail: InboxMail): Promise<InboxIngestResult> {
  const text = mail.bodyText ?? "";
  const handled = await handleStateNotice({ senderEmail: mail.senderEmail, subject: mail.subject, bodyText: text, authenticated: mail.authenticated === true, messageId: mail.messageId ?? null, receivedAt: mail.receivedAt ?? new Date() });
  if (handled) return handled.result as InboxIngestResult;

  const finish = async (result: InboxIngestResult, requestId: string | null): Promise<InboxIngestResult> => {
    if (mail.messageId) await markInboxMail(mail.messageId, { kind: "state_request_form", srn: null, outcome: result, requestId });
    return result;
  };
  // Service-verification receipts (hours) are a different flow: they are never read as a job request here.
  if (resolveIntakeType(undefined, text) !== "job_offer") return "skipped";
  try {
    const result = await processJobOfferEmail({ email: mail.senderEmail, subject: mail.subject, rawContent: text, strict: true });
    if (result.outcome === "not_a_job") return "skipped";
    if (result.outcome === "created") return finish("created", result.id);
    return finish(result.filled.length > 0 ? "filled" : "unchanged", result.id);
  } catch (error) {
    logError("Inbox form ingest", error);
    return "failed";
  }
}
