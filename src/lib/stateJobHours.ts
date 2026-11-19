import { randomBytes } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { requests, timesheets } from "@/db/schema";
import { lockRequestForPosition } from "@/lib/positionClaim";
import type { DbTx } from "@/lib/positionClaim";
import { mirrorTimesheetSubmission } from "@/lib/timesheetSync";
import { hashToken } from "@/lib/timesheetToken";
import type { StoredSignature } from "@/lib/verificationSignature";
import { MAX_TRAVEL_WINDOWS, isTravelWindow } from "@/lib/travelWindows";
import type { TravelWindow } from "@/lib/travelWindows";

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
  /** Travel there and back (the report's legs, or what staff typed from the receipt); empty when none. */
  travelWindows?: TravelWindow[];
  note: string;
  review?: ReviewSubmission;
}

/**
 * Travel legs for a timesheet that has none: the timesheet's own travel window (the first leg) when it is empty, and every leg on the
 * request when the request holds none for this timesheet. Never overwrites, so running it twice changes nothing.
 */
async function mergeMissingTravel(tx: DbTx, requestId: string, timesheetId: string, sheetHasNoTravel: boolean, travel: TravelWindow[]): Promise<void> {
  if (sheetHasNoTravel) {
    await tx
      .update(timesheets)
      .set({ travelStartTime: new Date(travel[0].start), travelEndTime: new Date(travel[0].end), updatedAt: new Date() })
      .where(and(eq(timesheets.id, timesheetId), isNull(timesheets.travelStartTime)));
  }
  await tx.execute(sql`
    UPDATE requests
    SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{travelWindows}',
      coalesce(data -> 'travelWindows', '{}'::jsonb) || jsonb_build_object(${timesheetId}::text, ${JSON.stringify(travel)}::jsonb))
    WHERE id = ${requestId} AND NOT (coalesce(data -> 'travelWindows', '{}'::jsonb) ? ${timesheetId}::text)
  `);
}

/**
 * The new timesheet's id, or null when this interpreter already has a timesheet on the job. The hours are then left as they are;
 * only missing travel is added (mergeMissingTravel).
 */
export async function recordStateJobHours(input: StateJobHoursInput, exec: DbTx = db as unknown as DbTx): Promise<{ id: string } | null> {
  const { requestId, interpreterId, start, end, serviceHours, totalMiles, note, review } = input;
  const travel = (input.travelWindows ?? []).filter(isTravelWindow).slice(0, MAX_TRAVEL_WINDOWS);
  const now = new Date();
  // `exec` is the database, or an open transaction (a savepoint then), so a caller can make this part of a bigger all-or-nothing step.
  return exec.transaction(async (tx) => {
    if (!(await lockRequestForPosition(tx, requestId))) return null;
    const [existing] = await tx
      .select({ id: timesheets.id, travelStart: timesheets.travelStartTime })
      .from(timesheets)
      .where(and(eq(timesheets.requestId, requestId), eq(timesheets.interpreterId, interpreterId)))
      .limit(1);
    if (existing) {
      // Already recorded: nothing about the hours is changed. Travel the existing timesheet never had (a receipt recorded before travel
      // was read, or staff's entry without it) is added, fill-only: travel already on it is never replaced.
      if (travel.length > 0) await mergeMissingTravel(tx, requestId, existing.id, existing.travelStart === null, travel);
      return null;
    }

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
        // The row holds one window (the first leg); every leg is kept on the request below.
        travelStartTime: travel[0] ? new Date(travel[0].start) : null,
        travelEndTime: travel[0] ? new Date(travel[0].end) : null,
        serviceNote: note,
        serviceCompleted: review?.serviceCompleted ?? null,
        cancellationReason: review?.cancellationReason ?? null,
        // The column predates S3 and holds what the review screen puts in <img src>: here an app link, never a public URL.
        signatureDataUrl: review?.signature?.url ?? null,
        status: review ? "submitted" : "approved",
        submittedAt: now,
      })
      .returning();

    // Staff-only, keyed by timesheet: every travel leg (billing pays them; Hours review shows them). Written before the mirror below,
    // which reads the request afresh and keeps it.
    if (travel.length > 0) {
      await tx.execute(sql`
        UPDATE requests
        SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{travelWindows}',
          coalesce(data -> 'travelWindows', '{}'::jsonb) || jsonb_build_object(${row.id}::text, ${JSON.stringify(travel)}::jsonb))
        WHERE id = ${requestId}
      `);
    }

    if (!review) {
      await tx.update(requests).set({ status: "completed", updatedAt: now }).where(eq(requests.id, requestId));
      return { id: row.id };
    }

    if (review.signature) {
      // Staff-only record on the request (interpreters never receive `serviceVerification`): where the file lives.
      // `signature` is the latest one (older readers); `signatures[timesheetId]` is each timesheet's own, so the two
      // interpreters of a team job can never be shown each other's signature.
      const stored = JSON.stringify(review.signature.stored);
      const latest = JSON.stringify({ signature: review.signature.stored });
      await tx.execute(sql`
        UPDATE requests
        SET data = jsonb_set(
          jsonb_set(
            coalesce(data, '{}'::jsonb),
            '{serviceVerification}',
            coalesce(data -> 'serviceVerification', '{}'::jsonb) || ${latest}::jsonb
          ),
          '{serviceVerification,signatures}',
          coalesce(data #> '{serviceVerification,signatures}', '{}'::jsonb) || jsonb_build_object(${review.timesheetId}::text, ${stored}::jsonb)
        )
        WHERE id = ${requestId}
      `);
    }
    // Same step an interpreter's submission performs: copies the hours into the request and sets 'awaiting_review'.
    await mirrorTimesheetSubmission(tx, requestId, interpreterId, row);
    return { id: row.id };
  });
}
