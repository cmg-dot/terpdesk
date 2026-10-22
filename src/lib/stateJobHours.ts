import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requests, timesheets } from "@/db/schema";
import { lockRequestForPosition } from "@/lib/positionClaim";
import { hashToken } from "@/lib/timesheetToken";

/**
 * Records hours for a state (ODHH / Apple Health) job from the state's own receipt. Because the source is already
 * verified, the timesheet is created directly as 'approved' and never enters the review queue, and the job moves
 * straight to 'completed' (the same closing step a normal approval performs).
 *
 * Shared by the agency's "log hours" form and the service-verification email intake, so both write identically.
 * Runs in one transaction under a row lock on the request, so two receipts arriving at once cannot create two rows.
 *
 * SERVER ONLY.
 */

export interface StateJobHoursInput {
  requestId: string;
  interpreterId: string;
  start: Date;
  end: Date;
  serviceHours: number;
  totalMiles: number;
  note: string;
}

/** The new timesheet's id, or null when this interpreter already has a timesheet on the job (nothing is changed). */
export async function recordStateJobHours(input: StateJobHoursInput): Promise<{ id: string } | null> {
  const { requestId, interpreterId, start, end, serviceHours, totalMiles, note } = input;
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
        requestId,
        interpreterId,
        tokenHash: hashToken(randomBytes(32).toString("hex")),
        tokenExpiresAt: now,
        actualStartTime: start,
        actualEndTime: end,
        billableHours: serviceHours.toFixed(2),
        // Miles come from the verified state receipt, so they are both reported and approved.
        mileage: totalMiles.toFixed(1),
        approvedMileage: totalMiles.toFixed(1),
        travelLegs: [],
        serviceNote: note,
        status: "approved",
        submittedAt: now,
      })
      .returning({ id: timesheets.id });

    await tx.update(requests).set({ status: "completed", updatedAt: now }).where(eq(requests.id, requestId));
    return row;
  });
}
