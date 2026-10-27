"use server";

import { requireInterpreter, FORBIDDEN } from "@/lib/auth/guards";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logActivity } from "@/lib/requestActivity";
import { lockRequestForPosition, positionOfOffer } from "@/lib/positionClaim";
import { revalidatePath } from "next/cache";
import { resolveRequestTimes } from "@/utils/timezone";
import { z } from "zod";
import { isStateJobRequest } from "@/lib/stateJob";
import { legacyPosition1Hours } from "@/utils/hoursState";
import { MAX_TOTAL_MILES, countLegs, sumCountedMiles, travelLegsSchema } from "@/lib/timesheetSchemas";
import type { TravelLeg } from "@/lib/timesheetSchemas";
import { replaceMileageLegs } from "@/lib/mileageLegs";
import { alertAgency } from "@/lib/lifecycleAlerts";

const signatureSchema = z
  .string()
  .max(400_000)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/);

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
    signatureDataUrl?: string;
    cancellationReason?: string;
    /** Itemised mileage legs; when present the server computes total miles from them. */
    legs?: TravelLeg[];
  }
): Promise<{ success: boolean }> {
  const { interpreterId: sessionInterpreterId } = await requireInterpreter();
  // Only an interpreter holding the accepted booking may report hours for it.
  const [ownBooking] = await db
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.requestId, requestId), eq(offers.interpreterId, sessionInterpreterId), eq(offers.status, "accepted")))
    .limit(1);
  if (!ownBooking) throw new Error(FORBIDDEN);

  // State jobs (ODHH/HCA) are reported in the state portal; the internal form is not allowed for them.
  const [jobRow] = await db
    .select({ isStateJob: requests.isStateJob, data: requests.data })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1);
  if (jobRow && isStateJobRequest(jobRow)) throw new Error("Cannot submit internal timesheets for State Jobs.");

  // Optional, but if present it must be a bounded PNG data URL.
  const signatureDataUrl = extra?.signatureDataUrl === undefined
    ? undefined
    : signatureSchema.parse(extra.signatureDataUrl);

  const cancellationReason = extra?.cancellationReason === undefined
    ? undefined
    : z.string().trim().max(1000).parse(extra.cancellationReason);

  // Empty and 0-mile legs are dropped and each leg's counted miles (doubled on a round trip) are worked out here.
  // The total comes from the legs whenever legs were sent, even if every one was empty; the `miles` argument is only
  // used by a caller that sends no legs at all.
  const legs = countLegs(travelLegsSchema.parse(extra?.legs ?? []));
  const totalMiles = extra?.legs !== undefined ? sumCountedMiles(legs) : miles;
  if (!Number.isFinite(totalMiles) || totalMiles < 0 || totalMiles > MAX_TOTAL_MILES) {
    throw new Error("Mileage is out of range.");
  }

  await db.transaction(async (tx) => {
    // Row lock: on a team job, both interpreters submitting at once are serialised, so neither overwrites the other.
    const existing = await lockRequestForPosition(tx, requestId);

    if (!existing) {
      throw new Error("Request not found");
    }

    // The position comes from the interpreter's OWN accepted offer, never from the browser, so a team member can only
    // ever write their own position's hours.
    const posIdx = positionOfOffer(existing.offerPositions, ownBooking.id);
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

    if (isCompleted === false && !cancellationReason) {
      throw new Error("A reason is required when the service was not completed.");
    }

    const storedHours = existingData.hoursSubmissions?.[posIdx] || (posIdx === 1 ? legacyPosition1Hours(existingData) : null) || {};
    // Hours left in this position by a previous (since replaced) interpreter are never merged into these.
    const existingHours = storedHours.interpreterId && storedHours.interpreterId !== sessionInterpreterId ? {} : storedHours;
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
        mileage: totalMiles,
        breakMinutes: extra?.breakMinutes ?? 0,
        travelStartTime: extra?.travelStartTime ?? null,
        travelEndTime: extra?.travelEndTime ?? null,
        serviceCompleted: extra?.serviceCompleted ?? null,
        mileageNote: extra?.mileageNote ?? "",
        note: extra?.note ?? "",
        positionIndex: posIdx,
      }
    };

    // History is kept server-side (the browser's copy is never trusted): the stored entries plus this submission.
    const finalHistory = [...existingHistory, historyEntry];

    const submissionForPos = {
      ...existingHours,
      // An in-app (re)submission replaces any secure-link mirror, so the review panel shows this version.
      timesheetId: null,
      source: 'in_app',
      positionIndex: posIdx,
      interpreterName: extra?.interpreterName || existingHours.interpreterName,
      interpreterId: sessionInterpreterId,
      actualStartTime,
      actualEndTime,
      miles: totalMiles,
      legs,
      breakMinutes: extra?.breakMinutes ?? 0,
      travelStartTime: extra?.travelStartTime ?? null,
      travelEndTime: extra?.travelEndTime ?? null,
      serviceCompleted: extra?.serviceCompleted ?? null,
      mileageNote: extra?.mileageNote ?? "",
      note: extra?.note ?? "",
      version: extra?.version ?? 1,
      signatureDataUrl: signatureDataUrl ?? null,
      cancellationReason: isCompleted === false ? (cancellationReason ?? null) : null,
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
        // The request-level columns are single-position legacy fields: only Position 1 writes them, so Position 2's
        // submission can't overwrite them. Each position's own values live in hoursSubmissions[position].
        ...(posIdx === 1
          ? {
              travelStartTime: travelStart && !isNaN(travelStart.getTime()) ? travelStart : null,
              travelEndTime: travelEnd && !isNaN(travelEnd.getTime()) ? travelEnd : null,
              serviceCompleted: isCompleted,
            }
          : {}),
        data: {
          ...existingData,
          hoursSubmissions: updatedHoursSubmissions,
          // Legacy single-position field: Position 1 only, so Position 2 can never leak into it.
          ...(posIdx === 1 ? { hoursSubmission: submissionForPos } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));
    await replaceMileageLegs(tx, { requestId, interpreterId: sessionInterpreterId }, legs);
  });

  await logActivity({ requestId, interpreterId: sessionInterpreterId, audience: "shared", kind: "hours_submitted", message: (extra?.version ?? 1) > 1 ? "Corrected hours submitted (in app)" : "Hours submitted (in app)", actorLabel: "Interpreter" });
  // Agency: in-app notification + email that hours are waiting for review.
  await alertAgency({ event: "timesheet_submitted", requestId, interpreterId: sessionInterpreterId, href: "/hours-review" });

  revalidatePath("/jobs");
  revalidatePath("/interpreter-home");
  revalidatePath("/mileage");
  revalidatePath("/dashboard");
  revalidatePath("/hours-review");
  revalidatePath(`/requests/${requestId}`);

  return { success: true };
}
