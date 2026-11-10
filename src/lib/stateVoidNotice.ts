import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { requestActivity, requests, users } from "@/db/schema";
import { logError } from "@/lib/logError";
import { notifyAgencyAdmins } from "@/lib/notifications";
import { logActivity } from "@/lib/requestActivity";
import { senderAllowed } from "@/lib/stateVoidParse";
import { afterVoid, voidJobCore } from "@/lib/voidJob";
import { isVoidedData } from "@/lib/voidReasons";

/**
 * The state's "Request Voided" email, applied: the job with that SRN is voided exactly as the "Void job" button would (see
 * voidJob.ts, kind "Voided by the state"), with the note "Job voided automatically via state email notification".
 *
 * Voiding closes a job, takes billing off and cancels bookings, and the Inbox accepts mail from anyone, so the email only acts
 * when it is trustworthy: the sender is the state, a registered agency user, or an address the agency listed in the
 * STATE_VOID_TRUSTED_SENDERS setting, AND the mail passed SES's DKIM/DMARC check. Otherwise nothing changes: the job gets a
 * staff-only note and the admins a notification, so a person can void it with one click.
 *
 * Never throws (the email is already stored; a failure here must not make the webhook answer 500). Safe to repeat: a job that is
 * already voided is left alone. HIPAA: only ids and fixed labels are logged. SERVER ONLY.
 */

export type StateVoidOutcome =
  | { outcome: "voided"; id: string }
  | { outcome: "already_voided"; id: string }
  | { outcome: "already_closed"; id: string }
  | { outcome: "no_job" }
  | { outcome: "unverified"; id: string }
  | { outcome: "needs_review"; id: string }
  | { outcome: "failed" };

export const AUTO_VOID_NOTE = "Job voided automatically via state email notification";
const UNVERIFIED_KIND = "void_notice_unverified";
const REVIEW_KIND = "void_notice_review";

export interface StateVoidInput {
  srn: string;
  senderEmail: string;
  /** The mail was authenticated: it passed SES's DKIM/DMARC check, or it came through the API-key-protected intake route. */
  authenticated: boolean;
}

/** The sender is the state, a registered agency user, or an address the agency listed (STATE_VOID_TRUSTED_SENDERS). Shared by every notice that acts on a job. */
export async function senderTrusted(senderEmail: string): Promise<boolean> {
  if (senderAllowed(senderEmail, process.env.STATE_VOID_TRUSTED_SENDERS)) return true;
  const [staff] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "agency"), sql`lower(${users.email}) = ${senderEmail.trim().toLowerCase()}`))
    .limit(1);
  return Boolean(staff);
}

/** One note per kind per job, so a repeated delivery of the same email does not pile up notes or notifications. */
export async function noteOnce(requestId: string, kind: string, message: string, title: string, body: string): Promise<void> {
  const [already] = await db.select({ id: requestActivity.id }).from(requestActivity).where(and(eq(requestActivity.requestId, requestId), eq(requestActivity.kind, kind))).limit(1);
  if (already) return;
  await logActivity({ requestId, kind, audience: "agency", message, actorLabel: "Email intake" });
  await notifyAgencyAdmins({ type: "job", href: `/requests/${requestId}`, title, message: body });
}

export async function processStateVoidNotice(input: StateVoidInput): Promise<StateVoidOutcome> {
  try {
    const srnOf = sql<string>`${requests.data}->'intake'->>'odhhSrn'`;
    const jobs = await db
      .select({ id: requests.id, status: requests.status, data: requests.data })
      .from(requests)
      .where(eq(srnOf, input.srn))
      .orderBy(desc(requests.updatedAt));
    if (jobs.length === 0) return { outcome: "no_job" };

    const isClosed = (status: string) => ["cancelled", "canceled"].includes(status.toLowerCase());
    const active = jobs.find((job) => !isClosed(job.status));
    if (!active) {
      const closed = jobs[0];
      return { outcome: jobs.some((job) => isVoidedData(job.data)) ? "already_voided" : "already_closed", id: closed.id };
    }

    if (!input.authenticated || !(await senderTrusted(input.senderEmail))) {
      await noteOnce(
        active.id,
        UNVERIFIED_KIND,
        "An email says the state voided this request, but it came from a sender that could not be verified. Nothing was changed. Check the Inbox and use Void job if it is right.",
        "Voided notice needs a check",
        "An email says the state voided a request, but its sender could not be verified. Open the request to check it.",
      );
      return { outcome: "unverified", id: active.id };
    }

    const result = await voidJobCore(active.id, "state_void", AUTO_VOID_NOTE, null);
    switch (result.status) {
      case "voided":
        await afterVoid(active.id, "state_void", result.interpreterIds, {
          message: AUTO_VOID_NOTE,
          actorLabel: "State email",
          userId: null,
          userEmail: null,
          auditAction: "request_voided_auto",
        });
        return { outcome: "voided", id: active.id };
      case "already_voided":
        return { outcome: "already_voided", id: active.id };
      case "hours_reported":
        await noteOnce(
          active.id,
          REVIEW_KIND,
          "The state voided this request by email, but hours were already reported for it, so it was not voided automatically. Please review it.",
          "Voided notice needs a review",
          "The state voided a request that already has hours reported. It was left as it is. Open the request to review it.",
        );
        return { outcome: "needs_review", id: active.id };
      default:
        return { outcome: "already_closed", id: active.id };
    }
  } catch (error) {
    logError("State void notice", error);
    return { outcome: "failed" };
  }
}
