import type { SubmittedTimesheet } from "@/app/actions/getSubmittedTimesheets";
import { getIanaZone } from "@/utils/timezone";
import { requestReference } from "@/utils/statusEngine";
import { legacyPosition1Hours } from "@/utils/hoursState";
import { isStateJobRequest } from "@/lib/stateJob";
import { closedJobKind } from "@/lib/closedJob";
import type { ClosedJobKind } from "@/lib/closedJob";
import { isPlainSingle, positionOrdinal, readPositions } from "@/lib/positions";
import { readTravelWindows, totalTravelMinutes } from "@/lib/travelWindows";
import type { TravelWindow } from "@/lib/travelWindows";

export interface ServiceRecord {
  id: string;
  appointmentId: string;
  /** The job's title and a human reference ("SRN #202786433" or "APT-1A2B3C"): the review card's header, instead of the request id. */
  title?: string;
  reference?: string;
  interpreterName: string;
  state: 'not_started' | 'draft' | 'submitted' | 'awaiting_review' | 'changes_requested' | 'correction_requested' | 'approved';
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string;
  actualEnd: string;
  breakMinutes: number;
  reportedMileage: number;
  approvedMileage: number | null;
  reviewMessage: string | null;
  version: number;
  isOdhh?: boolean;
  travelStart?: string;
  travelEnd?: string;
  serviceCompleted?: string | boolean;
  mileageNote?: string;
  /** Why the agency approved a different mileage than was reported (required by the approval when they differ). */
  mileageAdjustmentReason?: string | null;
  serviceNote?: string;
  history?: any[];
  positionIndex?: number;
  /** The position's 1-based place in the job's own numbering (what "Position N" shows; positionIndex is the stable id). */
  positionOrdinal?: number;
  /** Set when the record comes from a magic-link timesheet submission. */
  timesheetId?: string;
  signatureDataUrl?: string | null;
  /** Set when the job was voided, returned or cancelled: its hours are kept for the record but are not work to review. */
  jobClosed?: ClosedJobKind;
  /** Set only when the Verification PDF can be downloaded for this record: a non-state job with hours submitted. The position's stable id. */
  pdfPosition?: number;
  cancellationReason?: string | null;
  /** IANA zone of the job. Times are always shown in it, never in the viewer's local zone. */
  timeZone?: string;
  travelLegs?: { fromLabel: string; toLabel: string; miles: number; roundTrip: boolean; countedMiles?: number }[];
  /** Who worked it, and whether the job was in person: the commercial auto +$10 applies only in person. */
  interpreterId?: string;
  inPerson?: boolean;
  /** The interpreter holds a current commercial auto policy and the job was in person (set by useHoursRecords). */
  commercialAuto?: boolean;
  /** Minutes of travel submitted (every leg of a state verification); null when none was given (no fallback to the booking's times). */
  reportedTravelMinutes?: number | null;
  /** A state verification's travel legs, there and back (lib/travelWindows.ts); absent when the record has none. */
  travelWindows?: TravelWindow[];
  /** A State or Apple Health job (the commercial auto +$10 applies to these only, in person). */
  stateJob?: boolean;
  /** The record is the interpreter's cancellation form on a cancelled job (billable late cancellation): on file, nothing to approve. */
  cancelledBillable?: boolean;
}

/** Whole minutes from a submitted travel start to its end; null unless both are real times in order. */
export function travelWindowMinutes(start: unknown, end: unknown): number | null {
  const a = typeof start === "string" ? Date.parse(start) : NaN;
  const b = typeof end === "string" ? Date.parse(end) : NaN;
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) / 60000) : null;
}

/** The travel a record reports: every leg stored for its timesheet, else its one window. */
function reportedTravel(requestData: unknown, timesheetId: string | undefined, start: unknown, end: unknown): Pick<ServiceRecord, "reportedTravelMinutes" | "travelWindows"> {
  const windows = readTravelWindows(requestData, timesheetId);
  return windows ? { reportedTravelMinutes: totalTravelMinutes(windows), travelWindows: windows } : { reportedTravelMinutes: travelWindowMinutes(start, end) };
}

/** The single definition of "awaiting review", shared by the dashboard metric and the review panel. A closed job never awaits review. */
export const isAwaitingReview = (record: ServiceRecord): boolean =>
  !record.jobClosed && (record.state === "submitted" || record.state === "awaiting_review");

interface MergeParams {
  /** Records cached in the browser (terpdesk_service_records). */
  localRecords: ServiceRecord[];
  /** Requests from the database, as the merge reads them: the full mapped request or the slim HoursRequestRow (see hoursRequestRow.ts). */
  requests: any[];
  /** Live magic-link timesheets (submitted or approved). */
  timesheets: SubmittedTimesheet[];
}

/**
 * Builds the list of hours records shown in the review panel. The database is the source of truth:
 * cached records whose request no longer exists are dropped, cached records of a timesheet that no longer exists are dropped (any state),
 * and for records that do exist the database status wins over a stale cached state.
 */
export function mergeHoursRecords({ localRecords, requests, timesheets }: MergeParams): ServiceRecord[] {
  const requestIds = new Set<string>(requests.map((r) => r.id));
  const merged: ServiceRecord[] = localRecords.filter(
    (r) => Boolean(r.timesheetId) || requestIds.has(r.appointmentId),
  );
    for (const req of requests) {
      const positionData = req.data ?? req;
      const posList = readPositions(positionData).ids;
      // A job that is not the plain single position keeps one record per position.
      const perPosition = !isPlainSingle(positionData);
      // Once any position has real hours, only positions with hours get a record (no empty placeholder twin).
      const hasAnyHours = Object.keys(req.data?.hoursSubmissions ?? {}).length > 0 || Boolean(legacyPosition1Hours(req.data));

      for (const pos of posList) {
        const ordinal = positionOrdinal(positionData, pos);
        const hoursSub = req.data?.hoursSubmissions?.[pos] || (pos === 1 ? legacyPosition1Hours(req.data) : null);
        // Mirrored from a magic-link timesheet: that timesheet's own record (below) represents it,
        // unless the agency has since sent it back for correction (tracked on the request, as before).
        if (hoursSub?.timesheetId && hoursSub.status !== 'correction_requested') continue;
        const isEligibleStatus = !hasAnyHours && ['awaiting_review', 'correction_requested', 'approved'].includes(req.status);
        if (hoursSub || isEligibleStatus) {
          const recordId = perPosition ? `${req.id}-pos-${pos}` : req.id;
          const existingIdx = merged.findIndex(r => r.id === recordId || (!perPosition && r.appointmentId === req.id));
          const isOdhh = req.data?.intake?.program === 'WA ODHH' || req.data?.intake?.program === 'wa_odhh' || req.requester?.org === 'WA ODHH';
          const acceptedOffer = req.offers?.find((o: any) => (o.positionIndex === pos || (!o.positionIndex && pos === 1)) && (o.status === 'accepted' || o.state === 'accepted'));
          
          const posStatus = hoursSub?.status || req.status;
          const state: ServiceRecord['state'] = posStatus === 'approved' 
            ? 'approved' 
            : posStatus === 'correction_requested' 
              ? 'correction_requested' 
              : 'awaiting_review';

          const mappedRecord: ServiceRecord = {
            id: recordId,
            timeZone: getIanaZone(req.details?.timeZone ?? req.data?.details?.timeZone ?? req.timeZone ?? req.data?.timeZone),
            appointmentId: req.id,
            title: req.title,
            reference: requestReference(req.data?.intake?.odhhSrn, req.id),
            positionIndex: pos,
            positionOrdinal: ordinal,
            interpreterName: acceptedOffer?.interpreterName || hoursSub?.interpreterName || `Position ${ordinal} Interpreter`,
            state: state,
            scheduledStart: req.startsAt,
            scheduledEnd: req.endsAt,
            actualStart: hoursSub?.actualStartTime || req.startsAt,
            actualEnd: hoursSub?.actualEndTime || req.endsAt,
            breakMinutes: hoursSub?.breakMinutes || 0,
            reportedMileage: hoursSub?.miles || 0,
            approvedMileage: hoursSub?.approvedMileage ?? null,
            reviewMessage: hoursSub?.reviewMessage ?? null,
            version: hoursSub?.version || 1,
            isOdhh: isOdhh,
            // Each position's own values first; the request-level columns are a Position 1 legacy fallback only,
            // so one team member's travel never shows on the other's record.
            travelStart: hoursSub?.travelStartTime || (pos === 1 ? req.travelStartTime : null) || req.startsAt,
            travelEnd: hoursSub?.travelEndTime || (pos === 1 ? req.travelEndTime : null) || req.endsAt,
            serviceCompleted: hoursSub?.serviceCompleted ?? (pos === 1 ? req.serviceCompleted : null) ?? true,
            mileageNote: hoursSub?.mileageNote || "",
            mileageAdjustmentReason: hoursSub?.mileageAdjustmentReason ?? null,
            serviceNote: hoursSub?.note || "",
            history: hoursSub?.history || [],
            signatureDataUrl: hoursSub?.signatureDataUrl ?? null,
            pdfPosition: hoursSub && !isStateJobRequest({ isStateJob: req.isStateJob, data: req.data }) ? pos : undefined,
            cancellationReason: hoursSub?.cancellationReason ?? null,
            travelLegs: Array.isArray(hoursSub?.legs) ? hoursSub.legs : undefined,
            interpreterId: acceptedOffer?.interpreterId ?? undefined,
            inPerson: req.isVirtual === false,
            stateJob: isStateJobRequest({ isStateJob: req.isStateJob, data: req.data }),
            ...(hoursSub?.cancellationForm === true ? { cancelledBillable: true } : {}),
            ...reportedTravel(req.data, hoursSub?.timesheetId, hoursSub?.travelStartTime, hoursSub?.travelEndTime),
          };

          if (existingIdx > -1) {
            merged[existingIdx] = {
              ...mappedRecord,
              ...merged[existingIdx],
              // A record backed by a database submission takes the database status; cached state is only a fallback.
              state: hoursSub ? state : (merged[existingIdx].state || state),
              isOdhh: merged[existingIdx].isOdhh ?? isOdhh,
              // Local copies have signatures stripped (null); prefer the database value.
              signatureDataUrl: mappedRecord.signatureDataUrl ?? merged[existingIdx].signatureDataUrl ?? null,
              history: hoursSub?.history?.length ? hoursSub.history : (merged[existingIdx].history || mappedRecord.history),
            };
          } else {
            merged.push(mappedRecord);
          }
        }
      }
    }
    {
      const submitted = timesheets;
      const liveIds = new Set(submitted.map(t => t.timesheetId));
      for (let i = merged.length - 1; i >= 0; i--) {
        const r = merged[i];
        // A cached record tied to a timesheet that is no longer in the database goes, whatever its state. (An approved copy of a deleted
        // timesheet used to stay here for good: the page writes this merged list back to the browser cache on every load, so it was
        // never dropped, and a long-gone test job kept showing as an approved record.) A timesheet that exists is always in `timesheets`
        // (submitted and approved ones are both read), so nothing real is lost, and its record is rebuilt from the database below.
        if (r.timesheetId && !liveIds.has(r.timesheetId)) merged.splice(i, 1);
      }
      for (const ts of submitted) {
        // An emailed-link record has no position of its own: it is the one whose mirrored hours carry this timesheet's id.
        const owner = requests.find((r) => r.id === ts.requestId);
        const mirrored: Record<string, { timesheetId?: string }> = owner?.data?.hoursSubmissions ?? {};
        const mirroredPosition = Object.keys(mirrored).map(Number).find((p) => Number.isInteger(p) && p >= 1 && mirrored[p]?.timesheetId === ts.timesheetId);
        const rec: ServiceRecord = {
          id: `ts-${ts.timesheetId}`,
          timesheetId: ts.timesheetId,
      timeZone: ts.timeZone,
          appointmentId: ts.requestId,
          title: ts.title,
          reference: ts.reference,
          interpreterName: ts.interpreterName,
          state: ts.status === 'approved' ? 'approved' : 'awaiting_review',
          scheduledStart: ts.scheduledStart,
          scheduledEnd: ts.scheduledEnd,
          actualStart: ts.actualStart,
          actualEnd: ts.actualEnd,
          breakMinutes: ts.breakMinutes,
          reportedMileage: ts.reportedMileage,
          approvedMileage: ts.approvedMileage,
          reviewMessage: null,
          version: 1,
          isOdhh: ts.isOdhh,
          serviceNote: ts.notes,
          mileageNote: ts.mileageNote,
          mileageAdjustmentReason: ts.mileageAdjustmentReason,
          travelStart: ts.travelStart ?? undefined,
          travelEnd: ts.travelEnd ?? undefined,
          serviceCompleted: ts.serviceCompleted ?? undefined,
          cancellationReason: ts.cancellationReason,
          travelLegs: ts.travelLegs,
          signatureDataUrl: ts.signatureDataUrl,
          pdfPosition: owner && mirroredPosition && !ts.isOdhh && !isStateJobRequest({ isStateJob: owner.isStateJob, data: owner.data }) ? mirroredPosition : undefined,
          history: [],
          interpreterId: ts.interpreterId,
          inPerson: ts.isVirtual === false,
          stateJob: ts.isOdhh || (owner ? isStateJobRequest({ isStateJob: owner.isStateJob, data: owner.data }) : false),
          ...reportedTravel(owner?.data, ts.timesheetId, ts.travelStart, ts.travelEnd),
        };
        const idx = merged.findIndex(r => r.timesheetId === ts.timesheetId);
        if (idx > -1) merged[idx] = rec;
        else merged.push(rec);
      }
    }

  // A voided, returned or cancelled job keeps its hours on file, but they are marked so they never count as work to review. One pass
  // over every record (database, timesheet and browser-cached alike), so no branch above can miss one.
  const closedByRequest = new Map<string, ClosedJobKind>();
  for (const req of requests) {
    const kind = closedJobKind({ status: req.status, canceledAt: req.canceledAt, data: req.data });
    if (kind) closedByRequest.set(req.id, kind);
  }
  for (const record of merged) {
    const kind = closedByRequest.get(record.appointmentId);
    if (kind) record.jobClosed = kind;
    else delete record.jobClosed;
  }

  return merged;
}
