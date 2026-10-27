"use server";

import { requireRole, NOT_ALLOWED_MESSAGE } from "@/lib/auth/guards";
import { and, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { interpreters, requests, timesheets } from "@/db/schema";
import { sendApprovalEmail } from "@/lib/timesheetEmail";
import { writeAuditLog } from "@/lib/audit";
import { getIanaZone, resolveRequestTimes } from "@/utils/timezone";
import { ensureDisplayNameColumns, interpreterDisplayName } from "@/lib/displayName";
import { allBookedPositionsApproved, mirrorTimesheetApproval } from "@/lib/timesheetSync";
import { MILEAGE_REASON_REQUIRED, mileageAdjustmentReasonSchema, mileageDiffers } from "@/lib/timesheetSchemas";
import { logActivity } from "@/lib/requestActivity";

// requests.status is free text (no enum); 'completed' is already recognised by hoursState.ts and the jobs page.
const REQUEST_COMPLETED_STATUS = "completed";

const approveSchema = z.object({
  timesheetId: z.string().uuid(),
  approvedMileage: z.coerce.number().finite().min(0).max(2000),
  // Required (checked below) when the approved mileage differs from what was reported.
  mileageAdjustmentReason: mileageAdjustmentReasonSchema.optional(),
});

export type ApproveTimesheetResult =
  | { success: true; emailSent: boolean }
  | { success: false; error: string };

interface LooseData {
  details?: { timeZone?: string; timezone?: string };
  intake?: { program?: string };
  timeZone?: string;
  timezone?: string;
}

const fail = (error: string): ApproveTimesheetResult => ({ success: false, error });

export async function approveTimesheet(input: z.input<typeof approveSchema>): Promise<ApproveTimesheetResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return fail("Enter a valid, non-negative mileage.");
  const { timesheetId, approvedMileage } = parsed.data;

  try {
    // A submitted timesheet's mileage is fixed (its link is used up), so this read cannot go stale before the guarded
    // update below. `mileage` is the server-computed sum of the legs' counted miles.
    const [current] = await db
      .select({ mileage: timesheets.mileage })
      .from(timesheets)
      .where(and(eq(timesheets.id, timesheetId), eq(timesheets.status, "submitted")))
      .limit(1);
    if (!current) return fail("This timesheet is not awaiting review.");
    const adjusted = mileageDiffers(approvedMileage, Number(current.mileage ?? 0));
    const reason = adjusted ? parsed.data.mileageAdjustmentReason || null : null;
    if (adjusted && !reason) return fail(MILEAGE_REASON_REQUIRED);

    // Guarded update: only a 'submitted' timesheet can be approved, and only once.
    // The parent request's status is updated in the same transaction so the two cannot diverge.
    const approved = await db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(timesheets)
        .set({ status: "approved", approvedMileage: approvedMileage.toFixed(1), mileageAdjustmentReason: reason, updatedAt: now })
        .where(and(eq(timesheets.id, timesheetId), eq(timesheets.status, "submitted")))
        .returning({
          requestId: timesheets.requestId,
          interpreterId: timesheets.interpreterId,
          billableHours: timesheets.billableHours,
          travelLegs: timesheets.travelLegs,
        });
      if (!row) return null;
      // Keep the interpreter app's copy of these hours (requests.data.hoursSubmissions) in step.
      await mirrorTimesheetApproval(tx, row.requestId, timesheetId, approvedMileage, reason);
      // Team jobs: the request is 'completed' only once every booked position is approved; until then it stays in
      // review, so the other interpreter's job never shows as approved because of this approval.
      const everyoneApproved = await allBookedPositionsApproved(tx, row.requestId);
      await tx
        .update(requests)
        .set({ status: everyoneApproved ? REQUEST_COMPLETED_STATUS : "awaiting_review", updatedAt: now })
        .where(eq(requests.id, row.requestId));
      return row;
    });
    if (!approved) return fail("This timesheet is not awaiting review.");

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "timesheet_approved",
      details: `timesheetId=${timesheetId}; requestId=${approved.requestId}; approvedMileage=${approvedMileage.toFixed(1)}`,
    });

    await logActivity({ requestId: approved.requestId, interpreterId: approved.interpreterId, audience: "shared", kind: "hours_approved", message: "Hours approved", actorLabel: session.user.name ?? "Agency staff" });

    revalidatePath("/hours-review");
    revalidatePath("/dashboard");
    revalidatePath("/requests");
    revalidatePath(`/requests/${approved.requestId}`);
    revalidatePath("/jobs");
    revalidatePath("/interpreter-home");
    revalidatePath("/mileage");

    await ensureDisplayNameColumns();
    const [row] = await db
      .select({
        name: interpreterDisplayName,
        email: interpreters.email,
        createdAt: requests.createdAt,
        data: requests.data,
      })
      .from(requests)
      .innerJoin(interpreters, eq(interpreters.id, approved.interpreterId))
      .where(eq(requests.id, approved.requestId))
      .limit(1);
    if (!row?.email) return { success: true, emailSent: false };

    const data = (row.data ?? {}) as unknown as LooseData;
    const zone = getIanaZone(data.details?.timeZone ?? data.details?.timezone ?? data.timeZone ?? data.timezone);
    const { startsAt } = resolveRequestTimes({ createdAt: row.createdAt, data: row.data });
    const program = data.intake?.program;

    try {
      await sendApprovalEmail({
        to: row.email,
        interpreterName: row.name,
        dateLabel: formatInTimeZone(startsAt, zone, "MMMM d, yyyy"),
        approvedHours: `${approved.billableHours ?? "0.00"} hr`,
        approvedMileage: approvedMileage.toFixed(1),
        isOdhh: program === "WA ODHH" || program === "wa_odhh",
        travelLegCount: Array.isArray(approved.travelLegs) ? approved.travelLegs.length : 0,
      });
      return { success: true, emailSent: true };
    } catch {
      // The approval is already saved; report the email failure separately.
      return { success: true, emailSent: false };
    }
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? "unknown";
    console.error(`[approveTimesheet] failed (code: ${code})`);
    return fail("Could not approve the timesheet. Please try again.");
  }
}
