"use server";

import { db } from "@/db";
import { requests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { resolveRequestTimes } from "@/utils/timezone";

export async function submitInterpreterHours(
  requestId: string,
  actualStartTime: string,
  actualEndTime: string,
  miles: number,
  extra?: {
    positionIndex?: 1 | 2;
    interpreterId?: string;
    interpreterName?: string;
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
      .select({ createdAt: requests.createdAt, data: requests.data })
      .from(requests)
      .where(eq(requests.id, requestId));

    if (!existing) {
      throw new Error("Request not found");
    }

    const posIdx = extra?.positionIndex || 1;
    const existingData = (existing.data as any) || {};

    const { startsAt } = resolveRequestTimes({
      createdAt: existing.createdAt,
      data: existingData,
    });
    const startsAtMs = new Date(startsAt).getTime();
    if (!isNaN(startsAtMs) && Date.now() < startsAtMs) {
      throw new Error("Actual service time can only be entered once the appointment starts.");
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

    const existingHours = existingData.hoursSubmissions?.[posIdx] || (posIdx === 1 ? existingData.hoursSubmission : {}) || {};
    const existingHistory = Array.isArray(existingHours.history) ? existingHours.history : [];
    const isCorrection = (extra?.version ?? 1) > 1;
    const historyEntry = {
      id: Math.random().toString(36).substring(7),
      type: isCorrection ? 'correction_submitted' : 'initial_submission',
      title: isCorrection ? `Correction submitted (v${extra?.version})` : 'Initial hours submitted',
      actor: extra?.interpreterName || (posIdx === 2 ? 'Interpreter (Position 2)' : 'Interpreter (Position 1)'),
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
        positionIndex: posIdx,
      }
    };

    const finalHistory = Array.isArray(extra?.history) && extra.history.length > 0
      ? extra.history
      : [...existingHistory, historyEntry];

    const submissionForPos = {
      ...existingHours,
      positionIndex: posIdx,
      interpreterName: extra?.interpreterName || existingHours.interpreterName,
      interpreterId: extra?.interpreterId || existingHours.interpreterId,
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
      status: 'awaiting_review',
      history: finalHistory,
    };

    const updatedHoursSubmissions = {
      ...(existingData.hoursSubmissions || {}),
      [posIdx]: submissionForPos
    };

    await tx
      .update(requests)
      .set({
        status: "awaiting_review",
        travelStartTime: travelStart && !isNaN(travelStart.getTime()) ? travelStart : null,
        travelEndTime: travelEnd && !isNaN(travelEnd.getTime()) ? travelEnd : null,
        serviceCompleted: isCompleted,
        data: {
          ...existingData,
          hoursSubmissions: updatedHoursSubmissions,
          hoursSubmission: posIdx === 1 ? submissionForPos : (existingData.hoursSubmission || submissionForPos),
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
