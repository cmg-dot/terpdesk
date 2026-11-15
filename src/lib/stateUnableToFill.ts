import { desc, eq, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { logError } from "@/lib/logError";
import type { StateNoticeInput } from "@/lib/stateCancelNotice";
import { noteOnce, senderTrusted } from "@/lib/stateVoidNotice";
import { afterVoid, voidJobCore } from "@/lib/voidJob";
import { RETURNED_KIND } from "@/lib/voidReasons";

/**
 * The state's "Agency Reassignment" notice ("Sign Language Interpreter Service Agency Reassignment SRN #...", "Agency unable to fill
 * on <time>, By Contractor ... ASL Professionals"): the agency returned the job in the ODHH portal and the state passed it on. The job
 * with that number is closed exactly as the "Unable to fill" button would (voidJobCore with kind unable_to_fill: status Cancelled,
 * not billable, open offers withdrawn, the "Returned" badge). The email itself is the proof it was returned in the portal.
 *
 * Same trust rule as the cancellation and void notices: the sender is the state, a registered agency user or a listed address, AND the
 * mail was authenticated. Otherwise, or when someone is booked or hours were reported, nothing changes: the job gets a staff-only note
 * and the admins a notification. Safe to repeat. Never throws. HIPAA: only ids and fixed labels are logged. SERVER ONLY.
 */

export type UnableToFillOutcome =
  | { outcome: "returned" | "already_closed" | "unverified" | "needs_review"; id: string }
  | { outcome: "no_job" | "failed" };

export interface UnableToFillInput extends StateNoticeInput {
  /** The notice's own "Agency unable to fill on" time, when it states one. */
  at?: Date | null;
}

const UNVERIFIED_KIND = "unable_to_fill_notice_unverified";
const REVIEW_KIND = "unable_to_fill_notice_review";
const isClosed = (status: string): boolean => /^cancell?ed$/i.test(status.trim());

/** The agency-only activity line (and the kept close-out note): the state's own time, never anything from the email body. */
const noticeNote = (srn: string, at: Date | null | undefined): string =>
  `ODHH notice: agency unable to fill SRN #${srn}${at ? ` (returned ${formatInTimeZone(at, "America/Los_Angeles", "MMM d, yyyy h:mm a zzz")})` : ""}`;

export async function processStateUnableToFill(input: UnableToFillInput): Promise<UnableToFillOutcome> {
  try {
    const jobs = await db
      .select({ id: requests.id, status: requests.status })
      .from(requests)
      .where(eq(sql<string>`${requests.data}->'intake'->>'odhhSrn'`, input.srn))
      .orderBy(desc(requests.updatedAt));
    if (jobs.length === 0) return { outcome: "no_job" };
    const active = jobs.find((job) => !isClosed(job.status));
    if (!active) return { outcome: "already_closed", id: jobs[0].id };

    if (!input.authenticated || !(await senderTrusted(input.senderEmail))) {
      await noteOnce(
        active.id,
        UNVERIFIED_KIND,
        "An email says the agency was unable to fill this request, but it came from a sender that could not be verified. Nothing was changed. Check the Inbox and use Unable to fill if it is right.",
        "Unable-to-fill notice needs a check",
        "An email says a request was returned to the state, but its sender could not be verified. Open the request to check it.",
      );
      return { outcome: "unverified", id: active.id };
    }

    const note = noticeNote(input.srn, input.at);
    const result = await voidJobCore(active.id, RETURNED_KIND, note, null, db, { portalReturned: true });
    switch (result.status) {
      case "voided":
        await afterVoid(active.id, RETURNED_KIND, result.interpreterIds, {
          message: note,
          actorLabel: "State email",
          userId: null,
          userEmail: null,
          auditAction: "request_returned_unfilled_auto",
          auditExtra: "portalReturned=yes",
        });
        return { outcome: "returned", id: active.id };
      case "booked":
      case "hours_reported":
      case "portal_unconfirmed":
        await noteOnce(
          active.id,
          REVIEW_KIND,
          `The state says the agency was unable to fill this request (SRN #${input.srn}), but ${result.status === "hours_reported" ? "hours were already reported" : "an interpreter is booked on it"}, so it was not closed automatically. Please review it.`,
          "Unable-to-fill notice needs a review",
          "The state says a request was returned unfilled, but it is booked or has hours. It was left as it is. Open the request to review it.",
        );
        return { outcome: "needs_review", id: active.id };
      case "not_found":
        return { outcome: "no_job" };
      default:
        return { outcome: "already_closed", id: active.id };
    }
  } catch (error) {
    logError("State unable-to-fill notice", error);
    return { outcome: "failed" };
  }
}
