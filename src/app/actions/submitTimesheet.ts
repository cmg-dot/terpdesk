"use server";

import { and, eq, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { timesheets } from "@/db/schema";
import { getPendingTimesheetByToken } from "@/lib/timesheets";
import { hashToken, TOKEN_PATTERN } from "@/lib/timesheetToken";
import { wallClockToUtc } from "@/utils/timezone";
import { MAX_TOTAL_MILES, sumLegMiles, travelLegsSchema } from "@/lib/timesheetSchemas";
import { mirrorTimesheetSubmission } from "@/lib/timesheetSync";
import { logActivity } from "@/lib/requestActivity";
import { alertAgency } from "@/lib/lifecycleAlerts";

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_SIGNATURE_LENGTH = 400_000;
const MAX_SHIFT_HOURS = 24;

const submitTimesheetSchema = z.object({
  token: z.string().regex(TOKEN_PATTERN),
  actualStartTime: z.string().regex(LOCAL_DATETIME, "Enter a valid start time."),
  actualEndTime: z.string().regex(LOCAL_DATETIME, "Enter a valid end time."),
  // Which of these apply depends on the job type (ODHH vs private), which is decided server-side
  // from the request, never from the client. Both sets are therefore optional here.
  breakMinutes: z.coerce.number().int("Break must be whole minutes.").min(0).max(480).optional(),
  travelStartsAt: z.string().regex(LOCAL_DATETIME, "Enter a valid travel start.").optional().or(z.literal("")),
  travelEndsAt: z.string().regex(LOCAL_DATETIME, "Enter a valid travel end.").optional().or(z.literal("")),
  // Itemised mileage; the total is computed server-side and never taken from the client.
  legs: travelLegsSchema.default([]),
  mileageNote: z.string().trim().max(1000, "Mileage note is too long.").optional(),
  // ODHH verification question; ignored for private jobs.
  serviceCompleted: z.boolean().optional(),
  cancellationReason: z.string().trim().max(1000, "Reason is too long.").optional(),
  serviceNote: z.string().trim().max(2000, "Notes are too long.").optional(),
  signatureDataUrl: z
    .string()
    .max(MAX_SIGNATURE_LENGTH, "Signature is too large.")
    .regex(PNG_DATA_URL, "A signature is required."),
});

export type SubmitTimesheetInput = z.input<typeof submitTimesheetSchema>;
export type SubmitTimesheetResult = { success: true } | { success: false; error: string };

const INVALID_LINK = "This timesheet link is invalid, expired, or has already been submitted.";

export async function submitTimesheet(input: SubmitTimesheetInput): Promise<SubmitTimesheetResult> {
  const parsed = submitTimesheetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid submission." };
  }
  const { token, actualStartTime, actualEndTime, legs, mileageNote, serviceNote, signatureDataUrl } = parsed.data;

  // Re-verify the token server-side; also gives us the appointment's time zone and job type.
  const appointment = await getPendingTimesheetByToken(token);
  if (!appointment) return { success: false, error: INVALID_LINK };

  const toUtc = (local: string): Date => new Date(wallClockToUtc(`${local}:00`, appointment.ianaZone));
  const start = toUtc(actualStartTime);
  const end = toUtc(actualEndTime);
  const shiftMinutes = (end.getTime() - start.getTime()) / 60_000;

  if (Number.isNaN(shiftMinutes) || shiftMinutes <= 0) {
    return { success: false, error: "End time must be after start time." };
  }
  if (shiftMinutes > MAX_SHIFT_HOURS * 60) {
    return { success: false, error: "Shift cannot exceed 24 hours." };
  }

  let breakMinutes: number | null = null;
  let travelStart: Date | null = null;
  let travelEnd: Date | null = null;

  if (appointment.isOdhh) {
    // ODHH: travel is reported instead of an unpaid break. Both or neither.
    const ts = parsed.data.travelStartsAt || null;
    const te = parsed.data.travelEndsAt || null;
    if (Boolean(ts) !== Boolean(te)) {
      return { success: false, error: "Enter both travel start and travel end, or leave both empty." };
    }
    if (ts && te) {
      travelStart = toUtc(ts);
      travelEnd = toUtc(te);
      if (travelEnd.getTime() <= travelStart.getTime()) {
        return { success: false, error: "Travel end must be after travel start." };
      }
    }
  } else {
    breakMinutes = parsed.data.breakMinutes ?? 0;
    if (breakMinutes >= shiftMinutes) {
      return { success: false, error: "Unpaid break must be shorter than the service time." };
    }
  }

  const hours = (shiftMinutes - (breakMinutes ?? 0)) / 60;

  const mileage = sumLegMiles(legs);
  if (mileage > MAX_TOTAL_MILES) {
    return { success: false, error: "Total mileage looks too high. Please check the legs." };
  }
  const serviceCompleted = appointment.isOdhh ? (parsed.data.serviceCompleted ?? true) : null;
  const cancellationReason = serviceCompleted === false ? parsed.data.cancellationReason || null : null;
  if (serviceCompleted === false && !cancellationReason) {
    return { success: false, error: "Please give a reason the service was not completed." };
  }

  const now = new Date();
  // Single conditional UPDATE: the status/expiry guard and the write are one atomic statement,
  // so concurrent submissions of the same link cannot both succeed. The same transaction mirrors the hours into
  // the request (the record the interpreter app reads), so the two can never disagree.
  const submitted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(timesheets)
      .set({
        actualStartTime: start,
        actualEndTime: end,
        breakMinutes,
        travelStartTime: travelStart,
        travelEndTime: travelEnd,
        billableHours: hours.toFixed(2),
        mileage: mileage.toFixed(1),
        travelLegs: legs,
        mileageNote: mileageNote || null,
        serviceCompleted,
        cancellationReason,
        serviceNote: serviceNote || null,
        signatureDataUrl,
        status: "submitted",
        submittedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(timesheets.tokenHash, hashToken(token)),
          eq(timesheets.status, "pending"),
          gt(timesheets.tokenExpiresAt, now),
        ),
      )
      .returning();
    if (!row) return null;
    await mirrorTimesheetSubmission(tx, row.requestId, row.interpreterId, row);
    return row;
  });

  if (!submitted) return { success: false, error: INVALID_LINK };
  await logActivity({ requestId: submitted.requestId, interpreterId: submitted.interpreterId, audience: "shared", kind: "hours_submitted", message: "Hours submitted (secure link)", actorLabel: "Interpreter" });
  // Agency: in-app notification + email that hours are waiting for review.
  await alertAgency({ event: "timesheet_submitted", requestId: submitted.requestId, interpreterId: submitted.interpreterId, href: "/hours-review" });

  revalidatePath(`/requests/${appointment.requestId}`);
  revalidatePath("/hours-review");
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/interpreter-home");

  return { success: true };
}
