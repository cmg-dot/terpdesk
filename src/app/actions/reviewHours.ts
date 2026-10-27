"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/requestActivity";
import { legacyPosition1Hours } from "@/utils/hoursState";
import { alertInterpreter } from "@/lib/lifecycleAlerts";
import { z } from "zod";
import { MAX_TOTAL_MILES, MILEAGE_REASON_REQUIRED, mileageAdjustmentReasonSchema, mileageDiffers } from "@/lib/timesheetSchemas";

const approveHoursSchema = z.object({
  requestId: z.string().uuid(),
  approvedMileage: z.number().finite().min(0).max(MAX_TOTAL_MILES),
  positionIndex: z.union([z.literal(1), z.literal(2)]),
  mileageAdjustmentReason: mileageAdjustmentReasonSchema.optional(),
});

export type ApproveHoursResult = { success: true } | { success: false; error: string };

export async function approveHours(
  requestId: string,
  approvedMileage: number,
  positionIndex: 1 | 2 = 1,
  mileageAdjustmentReason?: string,
): Promise<ApproveHoursResult> {
  await requireRole("agency");
  const parsed = approveHoursSchema.safeParse({ requestId, approvedMileage, positionIndex: positionIndex || 1, mileageAdjustmentReason });
  if (!parsed.success) return { success: false, error: "Enter a valid, non-negative mileage." };

  const failure = await db.transaction(async (tx): Promise<string | null> => {
    const [existing] = await tx
      .select({ data: requests.data })
      .from(requests)
      .where(eq(requests.id, requestId));

    if (!existing) {
      throw new Error("Request not found");
    }

    const posIdx = positionIndex || 1;
    const existingData = (existing.data as any) || {};
    const existingHours = existingData.hoursSubmissions?.[posIdx] || (posIdx === 1 ? legacyPosition1Hours(existingData) : null) || {};
    const existingHistory = Array.isArray(existingHours.history) ? existingHours.history : [];

    // `miles` on the stored hours is the server-computed sum of the legs' counted miles.
    const adjusted = mileageDiffers(approvedMileage, Number(existingHours.miles ?? 0));
    const adjustmentReason = adjusted ? parsed.data.mileageAdjustmentReason || null : null;
    if (adjusted && !adjustmentReason) return MILEAGE_REASON_REQUIRED;

    const approveHistoryEntry = {
      id: Math.random().toString(36).substring(7),
      type: 'approved',
      title: `Hours approved and finalized (Position ${posIdx})`,
      actor: 'Agency Staff',
      timestamp: new Date().toISOString(),
      version: existingHours.version || 1,
      positionIndex: posIdx,
      details: {
        approvedMileage,
        ...(adjustmentReason ? { mileageAdjustmentReason: adjustmentReason } : {}),
      }
    };

    const updatedPosHours = {
      ...existingHours,
      positionIndex: posIdx,
      status: 'approved',
      approvedMileage,
      mileageAdjustmentReason: adjustmentReason,
      approvedAt: new Date().toISOString(),
      reviewMessage: null,
      history: [...existingHistory, approveHistoryEntry],
    };

    const updatedHoursSubmissions = {
      ...(existingData.hoursSubmissions || {}),
      [posIdx]: updatedPosHours
    };

    // Check if other position is awaiting review or correction
    const otherPos = posIdx === 1 ? 2 : 1;
    const otherPosHours = updatedHoursSubmissions[otherPos];
    // Team job: if the other position is booked but has no approved hours yet, the request is not done.
    const acceptedOffers = await tx
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.requestId, requestId), eq(offers.status, 'accepted')));
    const otherPosBooked = acceptedOffers.some((o) => (existingData.offerPositions?.[o.id] === 2 ? 2 : 1) === otherPos);
    let overallStatus = "approved";
    if (otherPosBooked && (!otherPosHours || !otherPosHours.status)) {
      overallStatus = "awaiting_review";
    } else if (otherPosHours && otherPosHours.status === 'awaiting_review') {
      overallStatus = "awaiting_review";
    } else if (otherPosHours && otherPosHours.status === 'correction_requested') {
      overallStatus = "correction_requested";
    }

    await tx
      .update(requests)
      .set({
        status: overallStatus,
        data: {
          ...existingData,
          hoursSubmissions: updatedHoursSubmissions,
          // Legacy single-position field: Position 1 only, so Position 2 can never leak into it.
          ...(posIdx === 1 ? { hoursSubmission: updatedPosHours } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));
    return null;
  });
  if (failure) return { success: false, error: failure };

  await logActivity({ requestId, kind: "hours_approved", message: `Hours approved (Position ${positionIndex || 1})`, actorLabel: "Agency staff" });
  revalidatePath("/jobs");
  revalidatePath("/interpreter-home");
  revalidatePath("/dashboard");
  revalidatePath("/hours-review");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/mileage");

  return { success: true };
}

export async function requestHoursCorrection(
  requestId: string,
  reviewMessage: string,
  positionIndex: 1 | 2 = 1
): Promise<{ success: boolean }> {
  await requireRole("agency");
  const reportedBy = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ data: requests.data })
      .from(requests)
      .where(eq(requests.id, requestId));

    if (!existing) {
      throw new Error("Request not found");
    }

    const posIdx = positionIndex || 1;
    const existingData = (existing.data as any) || {};
    const existingHours = existingData.hoursSubmissions?.[posIdx] || (posIdx === 1 ? legacyPosition1Hours(existingData) : null) || {};
    const existingHistory = Array.isArray(existingHours.history) ? existingHours.history : [];

    const corrReqHistoryEntry = {
      id: Math.random().toString(36).substring(7),
      type: 'correction_requested',
      title: `Correction requested by agency (Position ${posIdx})`,
      actor: 'Agency Staff',
      timestamp: new Date().toISOString(),
      version: existingHours.version || 1,
      positionIndex: posIdx,
      message: reviewMessage,
    };

    const updatedPosHours = {
      ...existingHours,
      positionIndex: posIdx,
      status: 'correction_requested',
      reviewMessage,
      correctionRequestedAt: new Date().toISOString(),
      history: [...existingHistory, corrReqHistoryEntry],
    };

    const updatedHoursSubmissions = {
      ...(existingData.hoursSubmissions || {}),
      [posIdx]: updatedPosHours
    };

    await tx
      .update(requests)
      .set({
        status: "correction_requested",
        data: {
          ...existingData,
          hoursSubmissions: updatedHoursSubmissions,
          // Legacy single-position field: Position 1 only, so Position 2 can never leak into it.
          ...(posIdx === 1 ? { hoursSubmission: updatedPosHours } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));
    // Who reported these hours, and which offer is theirs (for the alert's link).
    return {
      interpreterId: typeof existingHours.interpreterId === "string" ? (existingHours.interpreterId as string) : null,
      offerPositions: (existingData.offerPositions || {}) as Record<string, number>,
    };
  });

  // Interpreter: in-app notification + email (the agency's note itself stays in the app).
  const correctionPosition = positionIndex || 1;
  const accepted = await db
    .select({ id: offers.id, interpreterId: offers.interpreterId })
    .from(offers)
    .where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted")));
  const booking =
    accepted.find((o) => o.interpreterId === reportedBy.interpreterId) ??
    accepted.find((o) => (reportedBy.offerPositions[o.id] === 2 ? 2 : 1) === correctionPosition);
  const correctionInterpreterId = reportedBy.interpreterId ?? booking?.interpreterId ?? null;
  if (correctionInterpreterId) {
    await alertInterpreter({
      event: "timesheet_correction_requested",
      requestId,
      interpreterId: correctionInterpreterId,
      positionNumber: correctionPosition,
      offerId: booking?.id,
    });
  }

  await logActivity({ requestId, kind: "hours_correction_requested", message: `Hours correction requested (Position ${positionIndex || 1})`, actorLabel: "Agency staff" });
  revalidatePath("/jobs");
  revalidatePath("/interpreter-home");
  revalidatePath("/dashboard");
  revalidatePath("/hours-review");
  revalidatePath(`/requests/${requestId}`);

  return { success: true };
}
