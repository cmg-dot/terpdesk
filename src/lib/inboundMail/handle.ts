import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { classifyInboundMail } from "@/lib/inboundMail/classify";
import type { InboundClassification } from "@/lib/inboundMail/classify";
import { logError } from "@/lib/logError";
import { processRequesterCancelRequest } from "@/lib/requesterCancel";
import { processStateCancellation, processStateInProcess } from "@/lib/stateCancelNotice";
import { markInboxMail, recordStateEvent, setEventOutcome } from "@/lib/stateEvents";
import { noteOnce, processStateVoidNotice } from "@/lib/stateVoidNotice";

/**
 * Acts on incoming mail that is NOT a request form: the state's void, cancellation and "now in process" notices, and a requester's
 * reply. Both doors call it (the Inbox webhook and the Lambda's /api/intake), so the same email means the same thing wherever it
 * arrived. A request form (and anything unrecognised) returns null and the caller carries on with the form flow.
 *
 * What it will NOT do, on purpose: a reply from anyone but the state never creates or fills a job, and a requester's "please cancel"
 * never cancels one (it flags the job for a dispatcher: see requesterCancel.ts). Each outcome is saved on the stored email and, for
 * notices that name a request number, as an event keyed by the email's Message-ID.
 *
 * Never throws (the email is already stored). HIPAA: nothing from an email is logged. SERVER ONLY.
 */

export interface InboundMailInput {
  senderEmail: string;
  subject: string;
  bodyText: string;
  /** The mail was authenticated: it passed SES's DKIM/DMARC check, or it came through the API-key-protected intake route. */
  authenticated: boolean;
  /** The email's Message-ID. Mail from the Lambda has none, so a fingerprint of what it says stands in. */
  messageId: string | null;
  receivedAt: Date;
}

export interface HandledMail {
  classification: InboundClassification;
  /** What was saved on the email: applied / held / flagged / ignored ... */
  outcome: string;
  requestId: string | null;
  /** The legacy result words the Inbox webhook logs ("voided", "void_held", "void_ignored", "failed", ...). */
  result: string;
}

const fingerprint = (mail: InboundMailInput): string => `lambda:${createHash("sha256").update(`${mail.senderEmail}\n${mail.subject}\n${mail.bodyText}`).digest("hex")}`;

/** A reply that mentions cancelling in words that are not a clear instruction needs a person's eye, not silence. */
async function noteUnclearCancelMention(srn: string): Promise<string | null> {
  const [job] = await db.select({ id: requests.id, status: requests.status }).from(requests).where(and(eq(sql<string>`${requests.data}->'intake'->>'odhhSrn'`, srn))).orderBy(desc(requests.updatedAt)).limit(1);
  if (!job || /^cancell?ed$/i.test(job.status.trim())) return null;
  await noteOnce(job.id, "cancel_mention_review", "A reply about this request mentions cancelling, but not as a clear instruction. Check the Inbox.", "A reply mentions cancelling", `A reply about SRN #${srn} mentions cancelling. Open the Inbox to read it.`);
  return job.id;
}

export async function handleStateNotice(mail: InboundMailInput): Promise<HandledMail | null> {
  const classification = classifyInboundMail({ subject: mail.subject, bodyText: mail.bodyText, senderEmail: mail.senderEmail });
  const messageId = mail.messageId ?? fingerprint(mail);
  const { kind, srn } = classification;
  const done = async (outcome: string, requestId: string | null, result: string, event: boolean): Promise<HandledMail> => {
    if (event && srn) await setEventOutcome(messageId, outcome, requestId);
    if (mail.messageId) await markInboxMail(mail.messageId, { kind, srn, outcome, requestId });
    return { classification, outcome, requestId, result };
  };
  const record = async () => {
    if (srn) await recordStateEvent({ srn, kind, occurredAt: classification.cancelledAt ? new Date(classification.cancelledAt) : mail.receivedAt, receivedAt: mail.receivedAt, messageId, senderEmail: mail.senderEmail, authenticated: mail.authenticated });
  };

  try {
    switch (kind) {
      case "state_void": {
        const r = await processStateVoidNotice({ srn: srn ?? "", senderEmail: mail.senderEmail, authenticated: mail.authenticated });
        const id = "id" in r ? r.id : null;
        if (r.outcome === "voided") return done("voided", id, "voided", false);
        if (r.outcome === "failed") return done("failed", id, "failed", false);
        const held = r.outcome === "unverified" || r.outcome === "needs_review";
        return done(held ? "void_held" : "ignored", id, held ? "void_held" : "void_ignored", false);
      }
      case "state_cancellation": {
        await record();
        const r = await processStateCancellation({ srn: srn ?? "", senderEmail: mail.senderEmail, authenticated: mail.authenticated, cancelledAt: classification.cancelledAt ? new Date(classification.cancelledAt) : null });
        const id = "id" in r ? r.id : null;
        if (r.outcome === "cancelled") return done("cancelled", id, "cancelled", true);
        if (r.outcome === "unverified" || r.outcome === "needs_review") return done("cancel_held", id, "cancel_held", true);
        if (r.outcome === "no_job") return done("no_job", null, "no_job", true);
        return done(r.outcome === "failed" ? "failed" : "already_closed", id, r.outcome === "failed" ? "failed" : "unchanged", true);
      }
      case "state_in_process": {
        await record();
        const r = await processStateInProcess({ srn: srn ?? "", senderEmail: mail.senderEmail, authenticated: mail.authenticated });
        const id = "id" in r ? r.id : null;
        const outcome = r.outcome === "noted" || r.outcome === "already_noted" ? "noted" : r.outcome === "ignored" ? "ignored" : r.outcome;
        return done(outcome, id, outcome === "noted" ? "noted" : "unchanged", true);
      }
      case "requester_cancel_request": {
        await record();
        const r = await processRequesterCancelRequest({ srn: srn ?? "", senderEmail: mail.senderEmail, snippet: classification.snippet, messageId, receivedAt: mail.receivedAt });
        const id = "id" in r ? r.id : null;
        if (r.outcome === "flagged" || r.outcome === "already_flagged") return done("flagged_cancel", id, "flagged", true);
        return done(r.outcome === "failed" ? "failed" : r.outcome, id, r.outcome === "failed" ? "failed" : "unchanged", true);
      }
      case "requester_reply": {
        // Correspondence: never read as a request form. A cancel-ish wording that is not a clear instruction still gets a human look.
        const id = classification.intent && srn ? await noteUnclearCancelMention(srn) : null;
        return done(id ? "reply_needs_look" : "ignored_reply", id, "unchanged", false);
      }
      default:
        return null;
    }
  } catch (error) {
    logError("Inbound mail handling", error);
    return done("failed", null, "failed", false);
  }
}
