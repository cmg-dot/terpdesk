"use server";

import { and, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { interpreters, requests, timesheets } from "@/db/schema";
import { sendApprovalEmail } from "@/lib/timesheetEmail";
import { getIanaZone, resolveRequestTimes } from "@/utils/timezone";

// requests.status is free text (no enum); 'completed' is already recognised by hoursState.ts and the jobs page.
const REQUEST_COMPLETED_STATUS = "completed";

const approveSchema =z.object({
  timesheetId: z.string().uuid(),
  approvedMileage: z.coerce.number().finite().min(0).max(2000),
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
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return fail("Enter a valid, non-negative mileage.");
  const { timesheetId, approvedMileage } = parsed.data;

  try {
    // Guarded update: only a 'submitted' timesheet can be approved, and only once.
    // The parent request is moved to 'completed' in the same transaction so the two cannot diverge.
    const approved = await db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(timesheets)
        .set({ status: "approved", approvedMileage: approvedMileage.toFixed(1), updatedAt: now })
        .where(and(eq(timesheets.id, timesheetId), eq(timesheets.status, "submitted")))
        .returning({
          requestId: timesheets.requestId,
          interpreterId: timesheets.interpreterId,
          billableHours: timesheets.billableHours,
          travelLegs: timesheets.travelLegs,
        });
      if (!row) return null;
      await tx
        .update(requests)
        .set({ status: REQUEST_COMPLETED_STATUS, updatedAt: now })
        .where(eq(requests.id, row.requestId));
      return row;
    });
    if (!approved) return fail("This timesheet is not awaiting review.");

    revalidatePath("/hours-review");
    revalidatePath("/dashboard");
    revalidatePath("/requests");
    revalidatePath(`/requests/${approved.requestId}`);

    const [row] = await db
      .select({
        name: interpreters.name,
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
