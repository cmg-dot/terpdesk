"use server";

import { requireRole } from "@/lib/auth/guards";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, requests, timesheets } from "@/db/schema";
import type { TimesheetTravelLeg } from "@/db/schema";
import { getIanaZone, resolveRequestTimes } from "@/utils/timezone";

export interface SubmittedTimesheet {
  timesheetId: string;
  requestId: string;
  interpreterName: string;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string;
  actualEnd: string;
  billableHours: number;
  reportedMileage: number;
  notes: string;
  signatureDataUrl: string | null;
  submittedAt: string | null;
  isOdhh: boolean;
  status: "submitted" | "approved";
  approvedMileage: number | null;
  breakMinutes: number;
  /** The job's IANA time zone; all times must be displayed in it. */
  timeZone: string;
  travelStart: string | null;
  travelEnd: string | null;
  serviceCompleted: boolean | null;
  mileageNote: string;
  cancellationReason: string | null;
  travelLegs: TimesheetTravelLeg[];
}

interface LooseData {
  intake?: { program?: string };
  details?: { timeZone?: string; timezone?: string };
  timeZone?: string;
  timezone?: string;
}

/** Magic-link timesheets that were submitted (awaiting review) or already approved. */
export async function getSubmittedTimesheets(): Promise<SubmittedTimesheet[]> {
  await requireRole("agency");
  const rows = await db
    .select({
      timesheetId: timesheets.id,
      requestId: timesheets.requestId,
      interpreterName: interpreters.name,
      actualStart: timesheets.actualStartTime,
      actualEnd: timesheets.actualEndTime,
      billableHours: timesheets.billableHours,
      mileage: timesheets.mileage,
      approvedMileage: timesheets.approvedMileage,
      breakMinutes: timesheets.breakMinutes,
      travelStartTime: timesheets.travelStartTime,
      travelEndTime: timesheets.travelEndTime,
      serviceCompleted: timesheets.serviceCompleted,
      mileageNote: timesheets.mileageNote,
      cancellationReason: timesheets.cancellationReason,
      serviceNote: timesheets.serviceNote,
      travelLegs: timesheets.travelLegs,
      status: timesheets.status,
      notes: timesheets.notes,
      signatureDataUrl: timesheets.signatureDataUrl,
      submittedAt: timesheets.submittedAt,
      createdAt: requests.createdAt,
      data: requests.data,
    })
    .from(timesheets)
    .innerJoin(requests, eq(timesheets.requestId, requests.id))
    .innerJoin(interpreters, eq(timesheets.interpreterId, interpreters.id))
    .where(inArray(timesheets.status, ["submitted", "approved"]))
    .orderBy(desc(timesheets.submittedAt));

  return rows.map((r) => {
    const { startsAt, endsAt } = resolveRequestTimes({ createdAt: r.createdAt, data: r.data });
    const loose = r.data as unknown as LooseData;
    const program = loose.intake?.program;
    return {
      timesheetId: r.timesheetId,
      requestId: r.requestId,
      interpreterName: r.interpreterName,
      scheduledStart: startsAt,
      scheduledEnd: endsAt,
      actualStart: (r.actualStart ?? new Date(startsAt)).toISOString(),
      actualEnd: (r.actualEnd ?? new Date(endsAt)).toISOString(),
      billableHours: Number(r.billableHours ?? 0),
      reportedMileage: Number(r.mileage ?? 0),
      notes: r.serviceNote ?? r.notes ?? "",
      signatureDataUrl: r.signatureDataUrl,
      submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
      isOdhh: program === "WA ODHH" || program === "wa_odhh",
      status: r.status === "approved" ? "approved" : "submitted",
      approvedMileage: r.approvedMileage === null ? null : Number(r.approvedMileage),
      breakMinutes: r.breakMinutes ?? 0,
      timeZone: getIanaZone(loose.details?.timeZone ?? loose.details?.timezone ?? loose.timeZone ?? loose.timezone),
      travelStart: r.travelStartTime ? r.travelStartTime.toISOString() : null,
      travelEnd: r.travelEndTime ? r.travelEndTime.toISOString() : null,
      serviceCompleted: r.serviceCompleted,
      mileageNote: r.mileageNote ?? "",
      cancellationReason: r.cancellationReason,
      travelLegs: Array.isArray(r.travelLegs) ? r.travelLegs : [],
    };
  });
}
