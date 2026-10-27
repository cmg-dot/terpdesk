import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { timesheets } from "@/db/schema";
import { isTeamRequestData, legacyPosition1Hours } from "@/utils/hoursState";
import { timesheetToHoursSubmission } from "@/lib/timesheetSync";
import type { TimesheetForSync } from "@/lib/timesheetSync";

type JsonObject = Record<string, unknown>;

/**
 * The magic-link timesheets this interpreter submitted, newest per request. Newer submissions are mirrored into the
 * request already; this also covers ones sent before that mirror existed, so the app never shows "Submit actual
 * hours" for them.
 */
export async function latestSheetsByRequest(interpreterId: string): Promise<Map<string, TimesheetForSync>> {
  const rows: (TimesheetForSync & { requestId: string })[] = await db
    .select({
      id: timesheets.id,
      requestId: timesheets.requestId,
      status: timesheets.status,
      actualStartTime: timesheets.actualStartTime,
      actualEndTime: timesheets.actualEndTime,
      breakMinutes: timesheets.breakMinutes,
      travelStartTime: timesheets.travelStartTime,
      travelEndTime: timesheets.travelEndTime,
      mileage: timesheets.mileage,
      approvedMileage: timesheets.approvedMileage,
      mileageAdjustmentReason: timesheets.mileageAdjustmentReason,
      travelLegs: timesheets.travelLegs,
      mileageNote: timesheets.mileageNote,
      serviceNote: timesheets.serviceNote,
      serviceCompleted: timesheets.serviceCompleted,
      cancellationReason: timesheets.cancellationReason,
      submittedAt: timesheets.submittedAt,
    })
    .from(timesheets)
    .where(and(eq(timesheets.interpreterId, interpreterId), inArray(timesheets.status, ["submitted", "approved"])));
  const byRequest = new Map<string, TimesheetForSync>();
  for (const ts of rows) {
    const prev = byRequest.get(ts.requestId);
    if (!prev || (ts.submittedAt?.getTime() ?? 0) > (prev.submittedAt?.getTime() ?? 0)) byRequest.set(ts.requestId, ts);
  }
  return byRequest;
}

export interface OwnHours {
  /** The position (1 or 2) this offer holds on the request. */
  posIdx: 1 | 2;
  isTeamJob: boolean;
  /** The interpreter's own hours record for the job, or null when none has been reported. */
  hoursSub: JsonObject | null;
}

const asObject = (v: unknown): JsonObject => (v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : {});

/**
 * The hours the signed-in interpreter reported for one of their bookings: `requests.data.hoursSubmissions[position]`,
 * layered with their magic-link timesheet when that is newer or approved. Only the viewer's OWN hours are returned:
 * an entry recorded for another interpreter never is, and on a team job an entry without an owner is trusted only
 * when this offer's position is known for certain. `sheet` is the interpreter's latest submitted/approved timesheet for
 * the request (pass undefined unless the offer is accepted).
 */
export function resolveOwnHours(params: {
  rowData: JsonObject;
  offerId: string;
  interpreterId: string;
  sheet: TimesheetForSync | undefined;
}): OwnHours {
  const { rowData, offerId, interpreterId, sheet } = params;
  const isTeamJob = isTeamRequestData(rowData);
  const knownPosition = asObject(rowData.offerPositions)[offerId];
  const posIdx = (knownPosition || 1) as 1 | 2;
  const slotHours = asObject(rowData.hoursSubmissions)[posIdx] || (posIdx === 1 ? legacyPosition1Hours(rowData) : null);
  const slot = slotHours ? asObject(slotHours) : null;
  const ownerId = slot && typeof slot.interpreterId === "string" ? slot.interpreterId : null;
  const storedHours = !slot
    ? null
    : ownerId
      ? (ownerId === interpreterId ? slot : null)
      : (!isTeamJob || knownPosition ? slot : null);

  // Used when the request holds no submitted in-app hours, or holds this timesheet's own mirror. A mirror keeps
  // its stored review state (e.g. a correction request); only the timesheet's approval is layered on top.
  const isMirror = Boolean(sheet && storedHours?.timesheetId === sheet.id);
  const fromSheet = sheet && (isMirror || !storedHours?.submittedAt) ? timesheetToHoursSubmission(sheet, posIdx) : null;
  const hoursSub = !fromSheet
    ? storedHours
    : isMirror
      ? { ...fromSheet, ...storedHours, ...(sheet?.status === "approved" ? { status: "approved", approvedMileage: fromSheet.approvedMileage } : {}) }
      : { ...(storedHours || {}), ...fromSheet, isDraft: false };

  return { posIdx, isTeamJob, hoursSub };
}
