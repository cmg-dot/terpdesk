"use server";

import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { offers, requests, timesheets } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { isStateJobRequest } from "@/lib/stateJob";
import { hashToken } from "@/lib/timesheetToken";
import { getIanaZone, resolveRequestTimes, wallClockToUtc } from "@/utils/timezone";

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const logSchema = z.object({
  requestId: z.string().uuid(),
  interpreterId: z.string().uuid(),
  actualStartTime: z.string().regex(LOCAL_DATETIME, "Enter a valid start time."),
  actualEndTime: z.string().regex(LOCAL_DATETIME, "Enter a valid end time."),
  serviceHours: z.coerce.number().positive("Service hours must be more than 0.").max(24, "Service hours cannot exceed 24."),
  totalMiles: z.coerce.number().min(0, "Miles cannot be negative.").max(2000, "Miles look too high.").default(0),
  otherFees: z.coerce.number().min(0, "Fees cannot be negative.").max(10000, "Fees look too high.").default(0),
});

export type LogStateJobHoursInput = z.input<typeof logSchema>;
export type LogStateJobHoursResult = { success: true } | { success: false; error: string };

interface LooseData {
  details?: { timeZone?: string; timezone?: string };
  timeZone?: string;
  timezone?: string;
}

const fail = (error: string): LogStateJobHoursResult => ({ success: false, error });

/**
 * Agency staff record hours for a state job from the state's own receipt. Because the source is already
 * verified, the timesheet is created directly as 'approved' and never enters the review queue.
 */
export async function logStateJobHours(input: LogStateJobHoursInput): Promise<LogStateJobHoursResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return fail(NOT_ALLOWED_MESSAGE);
  }

  const parsed = logSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid details.");
  const { requestId, interpreterId, actualStartTime, actualEndTime, serviceHours, totalMiles, otherFees } = parsed.data;

  try {
    const [request] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
    if (!request) return fail("Request not found.");
    if (!isStateJobRequest(request)) return fail("Only state jobs (ODHH / Apple Health) can be logged here.");

    const [booking] = await db
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.requestId, requestId), eq(offers.interpreterId, interpreterId), eq(offers.status, "accepted")))
      .limit(1);
    if (!booking) return fail("That interpreter is not assigned to this job.");

    const { endsAt } = resolveRequestTimes({ createdAt: request.createdAt, data: request.data });
    if (new Date(endsAt).getTime() >= Date.now()) return fail("This appointment has not ended yet.");

    const data = (request.data ?? {}) as unknown as LooseData;
    const zone = getIanaZone(data.details?.timeZone ?? data.details?.timezone ?? data.timeZone ?? data.timezone);
    const start = new Date(wallClockToUtc(`${actualStartTime}:00`, zone));
    const end = new Date(wallClockToUtc(`${actualEndTime}:00`, zone));
    const elapsedHours = (end.getTime() - start.getTime()) / 3_600_000;
    if (!(elapsedHours > 0)) return fail("End time must be after start time.");
    if (serviceHours > elapsedHours + 1 / 60) return fail("Service hours cannot be longer than the time between start and end.");

    const now = new Date();
    const created = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: timesheets.id })
        .from(timesheets)
        .where(and(eq(timesheets.requestId, requestId), eq(timesheets.interpreterId, interpreterId)))
        .limit(1);
      if (existing) return null;

      // The token columns are required, but no link exists for this row: the hash is of a value nobody
      // holds and it is already expired, so it can never be used.
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
          // timesheets has no fees column, so extra fees are recorded in the note.
          serviceNote: otherFees > 0 ? `Logged by agency from state receipt. Additional fees: $${otherFees.toFixed(2)}` : "Logged by agency from state receipt.",
          status: "approved",
          submittedAt: now,
        })
        .returning({ id: timesheets.id });

      // Same closing step the normal approval performs, so the job moves straight to done.
      await tx.update(requests).set({ status: "completed", updatedAt: now }).where(eq(requests.id, requestId));
      return row;
    });
    if (!created) return fail("A timesheet already exists for this interpreter on this job.");

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "state_job_hours_logged",
      details: `timesheetId=${created.id}; requestId=${requestId}; interpreterId=${interpreterId}; serviceHours=${serviceHours.toFixed(2)}; totalMiles=${totalMiles.toFixed(1)}; otherFees=${otherFees.toFixed(2)}`,
    });

    revalidatePath("/hours-review");
    revalidatePath("/dashboard");
    revalidatePath("/requests");
    revalidatePath(`/requests/${requestId}`);
    return { success: true };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? "unknown";
    console.error(`[logStateJobHours] failed (code: ${code})`);
    return fail("Could not log the hours. Please try again.");
  }
}
