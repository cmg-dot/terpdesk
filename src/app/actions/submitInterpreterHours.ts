"use server";

import { db } from "@/db";
import { requests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function submitInterpreterHours(
  requestId: string,
  actualStartTime: string,
  actualEndTime: string,
  miles: number,
  extra?: {
    breakMinutes?: number;
    travelStartTime?: string | null;
    travelEndTime?: string | null;
    serviceCompleted?: boolean | string | null;
    mileageNote?: string;
    note?: string;
    version?: number;
    history?: any[];
  }
): Promise<{ success: boolean }> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ data: requests.data })
      .from(requests)
      .where(eq(requests.id, requestId));

    if (!existing) {
      throw new Error("Request not found");
    }

    const travelStart = extra?.travelStartTime ? new Date(extra.travelStartTime) : null;
    const travelEnd = extra?.travelEndTime ? new Date(extra.travelEndTime) : null;
    const isCompleted = typeof extra?.serviceCompleted === 'boolean'
      ? extra.serviceCompleted
      : extra?.serviceCompleted === 'yes'
        ? true
        : extra?.serviceCompleted === 'no'
          ? false
          : null;

    const existingHours = (existing.data as any)?.hoursSubmission || {};
    const existingHistory = Array.isArray(existingHours.history) ? existingHours.history : [];
    const isCorrection = (extra?.version ?? 1) > 1;
    const historyEntry = {
      id: Math.random().toString(36).substring(7),
      type: isCorrection ? 'correction_submitted' : 'initial_submission',
      title: isCorrection ? `Correction submitted (v${extra?.version})` : 'Initial hours submitted',
      actor: 'Interpreter',
      timestamp: new Date().toISOString(),
      version: extra?.version ?? 1,
      details: {
        actualStart: actualStartTime,
        actualEnd: actualEndTime,
        mileage: miles,
        breakMinutes: extra?.breakMinutes ?? 0,
        travelStartTime: extra?.travelStartTime ?? null,
        travelEndTime: extra?.travelEndTime ?? null,
        serviceCompleted: extra?.serviceCompleted ?? null,
        mileageNote: extra?.mileageNote ?? "",
        note: extra?.note ?? "",
      }
    };

    const finalHistory = Array.isArray(extra?.history) && extra.history.length > 0
      ? extra.history
      : [...existingHistory, historyEntry];

    await tx
      .update(requests)
      .set({
        status: "awaiting_review",
        travelStartTime: travelStart && !isNaN(travelStart.getTime()) ? travelStart : null,
        travelEndTime: travelEnd && !isNaN(travelEnd.getTime()) ? travelEnd : null,
        serviceCompleted: isCompleted,
        data: {
          ...existing.data,
          hoursSubmission: {
            ...existingHours,
            actualStartTime,
            actualEndTime,
            miles,
            breakMinutes: extra?.breakMinutes ?? 0,
            travelStartTime: extra?.travelStartTime ?? null,
            travelEndTime: extra?.travelEndTime ?? null,
            serviceCompleted: extra?.serviceCompleted ?? null,
            mileageNote: extra?.mileageNote ?? "",
            note: extra?.note ?? "",
            version: extra?.version ?? 1,
            submittedAt: new Date().toISOString(),
            reviewMessage: null,
            approvedMileage: null,
            history: finalHistory,
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
