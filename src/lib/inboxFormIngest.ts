import { logError } from "@/lib/logError";
import { processJobOfferEmail } from "@/lib/odhhIntakeProcess";
import { resolveIntakeType } from "@/lib/odhhVerificationParser";

/**
 * Mail that reaches the agency Inbox (for example Kari forwarding a state request form) gets the same treatment as mail that
 * reaches /api/intake: a form for a job we know fills that job's BLANK fields; a form for a new SRN becomes a draft job.
 * Only mail that is plainly the state's form is acted on (an SRN plus the state's own portal link for it), because the Inbox
 * accepts mail from anyone. Everything else stays in the Inbox, untouched.
 *
 * Never throws: the email is already stored, and a failure here must not make the webhook answer 500 (SNS would redeliver).
 * Safe to repeat: a form already applied changes nothing. SERVER ONLY.
 */
export interface InboxMail {
  senderEmail: string;
  subject: string;
  bodyText: string | null;
}

export type InboxIngestResult = "created" | "filled" | "unchanged" | "skipped" | "failed";

export async function ingestInboxStateForm(mail: InboxMail): Promise<InboxIngestResult> {
  const text = mail.bodyText ?? "";
  // Service-verification receipts (hours) are a different flow: they are never read as a job request here.
  if (resolveIntakeType(undefined, text) !== "job_offer") return "skipped";
  try {
    const result = await processJobOfferEmail({ email: mail.senderEmail, subject: mail.subject, rawContent: text, strict: true });
    if (result.outcome === "not_a_job") return "skipped";
    if (result.outcome === "created") return "created";
    return result.filled.length > 0 ? "filled" : "unchanged";
  } catch (error) {
    logError("Inbox form ingest", error);
    return "failed";
  }
}
