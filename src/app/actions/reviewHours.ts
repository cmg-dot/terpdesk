"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/requestActivity";
import { legacyPosition1Hours } from "@/utils/hoursState";

export async function approveHours(
  requestId: string,
  approvedMileage: number,
  positionIndex: 1 | 2 = 1
): Promise<{ success: boolean }> {
  await requireRole("agency");
  await db.transaction(async (tx) => {
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
      }
    };

    const updatedPosHours = {
      ...existingHours,
      positionIndex: posIdx,
      status: 'approved',
      approvedMileage,
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
  });

  await logActivity({ requestId, kind: "hours_approved", message: `Hours approved (Position ${positionIndex || 1})`, actorLabel: "Agency staff" });
  revalidatePath("/jobs");
  revalidatePath("/interpreter-home");
  revalidatePath("/dashboard");
  revalidatePath("/hours-review");
  revalidatePath(`/requests/${requestId}`);

  return { success: true };
}

export async function requestHoursCorrection(
  requestId: string,
  reviewMessage: string,
  positionIndex: 1 | 2 = 1
): Promise<{ success: boolean }> {
  await requireRole("agency");
  await db.transaction(async (tx) => {
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
  });

  await logActivity({ requestId, kind: "hours_correction_requested", message: `Hours correction requested (Position ${positionIndex || 1})`, actorLabel: "Agency staff" });
  revalidatePath("/jobs");
  revalidatePath("/interpreter-home");
  revalidatePath("/dashboard");
  revalidatePath("/hours-review");
  revalidatePath(`/requests/${requestId}`);

  return { success: true };
}
