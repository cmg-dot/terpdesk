import { randomBytes } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { requests, timesheets } from "@/db/schema";
import { lockRequestForPosition } from "@/lib/positionClaim";
import { mirrorTimesheetSubmission } from "@/lib/timesheetSync";
import { hashToken } from "@/lib/timesheetToken";
import type { StoredSignature } from "@/lib/verificationSignature";

/**
 * Records hours for a state (ODHH / Apple Health) job.
 *
 *  - Without `review` (the agency's "log hours" form): the staff member is the source, so the timesheet is created
 *    directly as 'approved' and the job moves straight to 'completed' (the same closing step a normal approval does).
 *  - With `review` (a service-verification email): the timesheet is created as 'submitted' and mirrored onto the
 *    request exactly like an interpreter's submission, so the job shows up under Hours review > "Awaiting review" and
 *    staff approve it (or not) after looking at the state's signature, cancellation and comments.
 *
 * Shared by both callers so they write identically. Runs in one transaction under a row lock on the request, so two
 * receipts arriving at once cannot create two rows.
 *
 * SERVER ONLY.
 */

/** What a verification email adds for the person who reviews it. */
export interface ReviewSubmission {
  /** Pre-generated so the signature link (which contains it) can be saved in the same insert. */
  timesheetId: string;
  serviceCompleted: boolean | null;
  cancellationReason: string | null;
  /** The stored file and the app link that opens it (see /api/verification-signature). */
  signature: { stored: StoredSignature; url: string } | null;
}

export interface StateJobHoursInput {
  requestId: string;
  interpreterId: string;
  /** Null only for a receipt that reports no service (cancelled / not completed) and gives no times. */
  start: Date | null;
  end: Date | null;
  serviceHours: number;
  totalMiles: number;
  note: string;
  review?: ReviewSubmission;
}

/** The new timesheet's id, or null when this interpreter already has a timesheet on the job (nothing is changed). */
export async function recordStateJobHours(input: StateJobHoursInput): Promise<{ id: string } | null> {
  const { requestId, interpreterId, start, end, serviceHours, totalMiles, note, review } = input;
  const now = new Date();
  return db.transaction(async (tx) => {
    if (!(await lockRequestForPosition(tx, requestId))) return null;
    const [existing] = await tx
      .select({ id: timesheets.id })
      .from(timesheets)
      .where(and(eq(timesheets.requestId, requestId), eq(timesheets.interpreterId, interpreterId)))
      .limit(1);
    if (existing) return null;

    // The token columns are required, but no link exists for this row: the hash is of a value nobody holds and it
    // is already expired, so it can never be used.
    const [row] = await tx
      .insert(timesheets)
      .values({
        ...(review ? { id: review.timesheetId } : {}),
        requestId,
        interpreterId,
        tokenHash: hashToken(randomBytes(32).toString("hex")),
        tokenExpiresAt: now,
        actualStartTime: start,
        actualEndTime: end,
        billableHours: serviceHours.toFixed(2),
        mileage: totalMiles.toFixed(1),
        // From the verified state receipt: approved as reported. For a review the agency confirms the mileage itself.
        approvedMileage: review ? null : totalMiles.toFixed(1),
        travelLegs: [],
        serviceNote: note,
        serviceCompleted: review?.serviceCompleted ?? null,
        cancellationReason: review?.cancellationReason ?? null,
        // The column predates S3 and holds what the review screen puts in <img src>: here an app link, never a public URL.
        signatureDataUrl: review?.signature?.url ?? null,
        status: review ? "submitted" : "approved",
        submittedAt: now,
      })
      .returning();

    if (!review) {
      await tx.update(requests).set({ status: "completed", updatedAt: now }).where(eq(requests.id, requestId));
      return { id: row.id };
    }

    if (review.signature) {
      // Staff-only record on the request (interpreters never receive `serviceVerification`): where the file lives.
      const pointer = JSON.stringify({ signature: review.signature.stored });
      await tx.execute(sql`
        UPDATE requests
        SET data = jsonb_set(
          coalesce(data, '{}'::jsonb),
          '{serviceVerification}',
          coalesce(data -> 'serviceVerification', '{}'::jsonb) || ${pointer}::jsonb
        )
        WHERE id = ${requestId}
      `);
    }
    // Same step an interpreter's submission performs: copies the hours into the request and sets 'awaiting_review'.
    await mirrorTimesheetSubmission(tx, requestId, interpreterId, row);
    return { id: row.id };
  });
}
