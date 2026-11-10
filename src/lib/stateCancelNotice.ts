import { and, desc, eq, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { requestActivity, requests } from "@/db/schema";
import { afterCancel, cancelJobCore } from "@/lib/cancelJob";
import { logActivity } from "@/lib/requestActivity";
import { logError } from "@/lib/logError";
import { pendingStateCancellation, setEventOutcome } from "@/lib/stateEvents";
import { noteOnce, senderTrusted } from "@/lib/stateVoidNotice";

/**
 * The state's own notices about a request, applied.
 *
 * CANCELLATION ("Sign Language Interpreter Service Request Cancellation - SRN #..."): the job with that number is cancelled exactly
 * as the Cancel button would (see cancelJob.ts), recording the state's own cancellation time and the hours of notice. It acts only
 * when it is trustworthy, by the same rule as a "Request Voided" notice: the sender is the state, a registered agency user or a
 * listed address, AND the mail passed SES's DKIM/DMARC check (or came through the API-key-protected route). Otherwise nothing
 * changes: the job gets a staff-only note and the admins a notification. A job with hours already reported is left for a person.
 * BILLING IS NEVER CHANGED: the notice hours are recorded for staff to judge.
 *
 * NOW IN PROCESS ("Interpreter Request Now In Process #..."): recorded once in the job's activity. It never changes the job's
 * status or the "confirmed in the portal" flag; a person still does that.
 *
 * Safe to repeat. Never throws (the email is already stored). HIPAA: only ids and fixed labels are logged. SERVER ONLY.
 */

export type StateCancelOutcome =
  | { outcome: "cancelled" | "already_cancelled" | "already_closed" | "unverified" | "needs_review"; id: string }
  | { outcome: "no_job" | "failed" };

export type StateInProcessOutcome = { outcome: "noted" | "already_noted" | "ignored"; id: string } | { outcome: "no_job" | "failed" };

export interface StateNoticeInput {
  srn: string;
  senderEmail: string;
  /** The mail was authenticated: it passed SES's DKIM/DMARC check, or it came through the API-key-protected intake route. */
  authenticated: boolean;
}

export interface StateCancelInput extends StateNoticeInput {
  /** The notice's own "Cancelled On" time, when it states one. */
  cancelledAt?: Date | null;
}

const UNVERIFIED_KIND = "cancel_notice_unverified";
const REVIEW_KIND = "cancel_notice_review";
const IN_PROCESS_KIND = "state_in_process";
const isClosed = (status: string): boolean => /^cancell?ed$/i.test(status.trim());

const jobsForSrn = (srn: string) =>
  db
    .select({ id: requests.id, status: requests.status })
    .from(requests)
    .where(eq(sql<string>`${requests.data}->'intake'->>'odhhSrn'`, srn))
    .orderBy(desc(requests.updatedAt));

/** "Cancelled Nov 9, 2026 11:34 AM PST, 213.4 hours before the appointment" (and a prompt to look at billing when under 48 hours). */
export function timingNote(at: Date, noticeHours: number | null): string {
  const when = formatInTimeZone(at, "America/Los_Angeles", "MMM d, yyyy h:mm a zzz");
  if (noticeHours === null) return `Cancelled ${when}. The appointment's start time is unknown.`;
  if (noticeHours < 0) return `Cancelled ${when}, ${Math.abs(noticeHours)} hours after the appointment started. Review billing.`;
  return `Cancelled ${when}, ${noticeHours} hours before the appointment.${noticeHours < 48 ? " Less than 48 hours' notice: review billing." : ""}`;
}

export async function processStateCancellation(input: StateCancelInput): Promise<StateCancelOutcome> {
  try {
    const jobs = await jobsForSrn(input.srn);
    if (jobs.length === 0) return { outcome: "no_job" };
    const active = jobs.find((job) => !isClosed(job.status));
    if (!active) return { outcome: "already_closed", id: jobs[0].id };

    if (!input.authenticated || !(await senderTrusted(input.senderEmail))) {
      await noteOnce(
        active.id,
        UNVERIFIED_KIND,
        "An email says the state cancelled this request, but it came from a sender that could not be verified. Nothing was changed. Check the Inbox and use Cancel if it is right.",
        "Cancellation notice needs a check",
        "An email says the state cancelled a request, but its sender could not be verified. Open the request to check it.",
      );
      return { outcome: "unverified", id: active.id };
    }

    const result = await cancelJobCore(active.id, { source: "state_notice", reason: "Cancelled by the state (ODHH cancellation notice)", cancelledAt: input.cancelledAt ?? null, srn: input.srn, refuseWithHours: true });
    if (result.status === "hours_reported") {
      await noteOnce(
        active.id,
        REVIEW_KIND,
        "The state cancelled this request by email, but hours were already reported for it, so it was not cancelled automatically. Please review it.",
        "Cancellation notice needs a review",
        "The state cancelled a request that already has hours reported. It was left as it is. Open the request to review it.",
      );
      return { outcome: "needs_review", id: active.id };
    }
    if (result.status !== "cancelled" && result.status !== "already_cancelled") return { outcome: "already_closed", id: active.id };

    if (result.status === "cancelled") {
      const at = new Date(result.updated.canceledAt ?? Date.now());
      await afterCancel(active.id, result, {
        clientRequested: false,
        actorLabel: "State email",
        agencyNotes: [
          { kind: "state_cancel_notice", message: `State cancellation notice processed for SRN #${input.srn} (ODHH confirmation)` },
          { kind: "cancel_notice_timing", message: timingNote(at, result.noticeHours) },
        ],
        audit: { action: "request_cancelled_state_notice", userId: null, userEmail: null, details: `srn=${input.srn}` },
      });
    } else {
      await afterCancel(active.id, result, { clientRequested: false, actorLabel: "State email" });
    }
    return { outcome: result.status, id: active.id };
  } catch (error) {
    logError("State cancellation notice", error);
    return { outcome: "failed" };
  }
}

/**
 * A job was just created from the state's form. If the state's cancellation for that number reached us FIRST (mail can arrive out of
 * order, and an imported or delayed form can lag), apply it now so the form cannot bring a cancelled request back to life.
 * Judged by the same trust rule as when it arrived. Never throws.
 */
export async function applyRecordedCancellation(srn: string): Promise<StateCancelOutcome | null> {
  const pending = await pendingStateCancellation(srn);
  if (!pending) return null;
  const result = await processStateCancellation({ srn, senderEmail: pending.senderEmail, authenticated: pending.authenticated, cancelledAt: pending.occurredAt });
  await setEventOutcome(pending.messageId, result.outcome === "cancelled" ? "cancelled" : result.outcome === "no_job" ? "no_job" : result.outcome, "id" in result ? result.id : null);
  return result;
}

export async function processStateInProcess(input: StateNoticeInput): Promise<StateInProcessOutcome> {
  try {
    const jobs = await jobsForSrn(input.srn);
    if (jobs.length === 0) return { outcome: "no_job" };
    const job = jobs[0];
    // A note anyone could write is noise: only the state, a registered user or a listed address, and only when authenticated.
    if (!input.authenticated || !(await senderTrusted(input.senderEmail))) return { outcome: "ignored", id: job.id };
    const [already] = await db.select({ id: requestActivity.id }).from(requestActivity).where(and(eq(requestActivity.requestId, job.id), eq(requestActivity.kind, IN_PROCESS_KIND))).limit(1);
    if (already) return { outcome: "already_noted", id: job.id };
    await logActivity({ requestId: job.id, kind: IN_PROCESS_KIND, audience: "agency", message: `State notice: request is now in process (SRN #${input.srn})`, actorLabel: "State email" });
    return { outcome: "noted", id: job.id };
  } catch (error) {
    logError("State in-process notice", error);
    return { outcome: "failed" };
  }
}
