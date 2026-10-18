import type { SubmittedTimesheet } from "@/app/actions/getSubmittedTimesheets";
import { getIanaZone } from "@/utils/timezone";

export interface ServiceRecord {
  id: string;
  appointmentId: string;
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
  serviceNote?: string;
  history?: any[];
  positionIndex?: 1 | 2;
  /** Set when the record comes from a magic-link timesheet submission. */
  timesheetId?: string;
  signatureDataUrl?: string | null;
  cancellationReason?: string | null;
  /** IANA zone of the job. Times are always shown in it, never in the viewer's local zone. */
  timeZone?: string;
  travelLegs?: { fromLabel: string; toLabel: string; miles: number; roundTrip: boolean }[];
}

/** The single definition of "awaiting review", shared by the dashboard metric and the review panel. */
export const isAwaitingReview = (record: ServiceRecord): boolean =>
  record.state === "submitted" || record.state === "awaiting_review";

interface MergeParams {
  /** Records cached in the browser (terpdesk_service_records). */
  localRecords: ServiceRecord[];
  /** Live requests from the database (fetchLiveRequests). */
  requests: any[];
  /** Live magic-link timesheets (submitted or approved). */
  timesheets: SubmittedTimesheet[];
}

/**
 * Builds the list of hours records shown in the review panel. The database is the source of truth:
 * cached records whose request no longer exists are dropped, and for records that do exist the
 * database status wins over a stale cached state.
 */
export function mergeHoursRecords({ localRecords, requests, timesheets }: MergeParams): ServiceRecord[] {
  const requestIds = new Set<string>(requests.map((r) => r.id));
  const merged: ServiceRecord[] = localRecords.filter(
    (r) => Boolean(r.timesheetId) || requestIds.has(r.appointmentId),
  );
    for (const req of requests) {
      const totalPos = (req.totalPositions || req.slotCount || (req.positions === "Team — two independent positions" ? 2 : 1)) as 1 | 2;
      const posList: (1 | 2)[] = totalPos === 2 ? [1, 2] : [1];

      for (const pos of posList) {
        const hoursSub = req.data?.hoursSubmissions?.[pos] || (pos === 1 ? req.data?.hoursSubmission : null);
        const isEligibleStatus = ['awaiting_review', 'correction_requested', 'approved'].includes(req.status);
        if (hoursSub || isEligibleStatus) {
          const recordId = totalPos === 2 ? `${req.id}-pos-${pos}` : req.id;
          const existingIdx = merged.findIndex(r => r.id === recordId || (totalPos === 1 && r.appointmentId === req.id));
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
            positionIndex: pos,
            interpreterName: acceptedOffer?.interpreterName || hoursSub?.interpreterName || (pos === 2 ? "Position 2 Interpreter" : "Position 1 Interpreter"),
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
            travelStart: req.travelStartTime || hoursSub?.travelStartTime || req.startsAt,
            travelEnd: req.travelEndTime || hoursSub?.travelEndTime || req.endsAt,
            serviceCompleted: req.serviceCompleted ?? hoursSub?.serviceCompleted ?? true,
            mileageNote: hoursSub?.mileageNote || "",
            serviceNote: hoursSub?.note || "",
            history: hoursSub?.history || [],
            signatureDataUrl: hoursSub?.signatureDataUrl ?? null,
            cancellationReason: hoursSub?.cancellationReason ?? null,
            travelLegs: Array.isArray(hoursSub?.legs) ? hoursSub.legs : undefined,
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
        if (r.timesheetId && !liveIds.has(r.timesheetId) && r.state !== 'approved') merged.splice(i, 1);
      }
      for (const ts of submitted) {
        const rec: ServiceRecord = {
          id: `ts-${ts.timesheetId}`,
          timesheetId: ts.timesheetId,
      timeZone: ts.timeZone,
          appointmentId: ts.requestId,
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
          travelStart: ts.travelStart ?? undefined,
          travelEnd: ts.travelEnd ?? undefined,
          serviceCompleted: ts.serviceCompleted ?? undefined,
          cancellationReason: ts.cancellationReason,
          travelLegs: ts.travelLegs,
          signatureDataUrl: ts.signatureDataUrl,
          history: [],
        };
        const idx = merged.findIndex(r => r.timesheetId === ts.timesheetId);
        if (idx > -1) merged[idx] = rec;
        else merged.push(rec);
      }
    }

  return merged;
}
