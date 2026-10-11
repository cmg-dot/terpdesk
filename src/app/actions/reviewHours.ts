"use server";

import { db } from "@/db";
import { requests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function approveHours(
  requestId: string,
  approvedMileage: number
): Promise<{ success: boolean }> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ data: requests.data })
      .from(requests)
      .where(eq(requests.id, requestId));

    if (!existing) {
      throw new Error("Request not found");
    }

    const existingHours = (existing.data as any)?.hoursSubmission || {};
    const existingHistory = Array.isArray(existingHours.history) ? existingHours.history : [];

    const approveHistoryEntry = {
      id: Math.random().toString(36).substring(7),
      type: 'approved',
      title: 'Hours approved and finalized',
      actor: 'Agency Staff',
      timestamp: new Date().toISOString(),
      version: existingHours.version || 1,
      details: {
        approvedMileage,
      }
    };

    await tx
      .update(requests)
      .set({
        status: "approved",
        data: {
          ...existing.data,
          hoursSubmission: {
            ...existingHours,
            approvedMileage,
            approvedAt: new Date().toISOString(),
            reviewMessage: null,
            history: [...existingHistory, approveHistoryEntry],
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));
  });

  revalidatePath("/jobs");
  revalidatePath("/interpreter-home");
  revalidatePath("/dashboard");
  revalidatePath("/hours-review");
  revalidatePath(`/requests/${requestId}`);

  return { success: true };
}

export async function requestHoursCorrection(
  requestId: string,
  reviewMessage: string
): Promise<{ success: boolean }> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ data: requests.data })
      .from(requests)
      .where(eq(requests.id, requestId));

    if (!existing) {
      throw new Error("Request not found");
    }

    const existingHours = (existing.data as any)?.hoursSubmission || {};
    const existingHistory = Array.isArray(existingHours.history) ? existingHours.history : [];

    const corrReqHistoryEntry = {
      id: Math.random().toString(36).substring(7),
      type: 'correction_requested',
      title: 'Correction requested by agency',
      actor: 'Agency Staff',
      timestamp: new Date().toISOString(),
      version: existingHours.version || 1,
      message: reviewMessage,
    };

    await tx
      .update(requests)
      .set({
        status: "correction_requested",
        data: {
          ...existing.data,
          hoursSubmission: {
            ...existingHours,
            reviewMessage,
            correctionRequestedAt: new Date().toISOString(),
            history: [...existingHistory, corrReqHistoryEntry],
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));
  });

  revalidatePath("/jobs");
  revalidatePath("/interpreter-home");
  revalidatePath("/dashboard");
  revalidatePath("/hours-review");
  revalidatePath(`/requests/${requestId}`);

  return { success: true };
}
