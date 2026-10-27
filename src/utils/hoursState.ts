import { resolveRequestTimes } from "./timezone";

export type HoursWorkflowState = 'not_submitted' | 'draft' | 'awaiting_review' | 'correction_requested' | 'approved';

export function parseSafeDate(dateVal: any): Date | null {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
  let d = new Date(dateVal);
  if (!isNaN(d.getTime())) return d;
  if (typeof dateVal === 'string') {
    d = new Date(dateVal.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
    if (/^\d+$/.test(dateVal)) {
      d = new Date(parseInt(dateVal, 10));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

export function getJobHoursState(job: any, serviceRecords: any[] = []): HoursWorkflowState {
  if (!job) return 'not_submitted';

  // 1. This browser's cached record for THIS booking only (matched by offer id, never by the shared request id).
  const record = findOwnServiceRecord(serviceRecords, job);

  const hs = job.hoursSubmission || {};
  // Team jobs: each position's own hours decide its state. The request-wide status reflects BOTH positions, so it is
  // ignored here, otherwise one interpreter's approval or submission would show on the other's job.
  const reqStatus = scopedRequestStatus(job);

  // Check for approved
  if (record?.state === 'approved' || reqStatus === 'approved' || reqStatus === 'completed' || reqStatus === 'billed' || hs.status === 'approved') {
    return 'approved';
  }

  // Check if agency requested correction
  const isLocalCorrection = record?.state === 'changes_requested' || record?.state === 'correction_requested';
  const isDbCorrection = reqStatus === 'correction_requested' || reqStatus === 'changes_requested' || hs.status === 'correction_requested' || hs.status === 'changes_requested';

  if (isLocalCorrection || isDbCorrection) {
    // If the interpreter resubmitted a newer version locally, check version
    if (record && (record.state === 'submitted' || record.state === 'awaiting_review')) {
      const localVer = Number(record.version || 1);
      const dbVer = Number(hs.version || 1);
      if (localVer > dbVer) {
        return 'awaiting_review';
      }
    }
    return 'correction_requested';
  }

  // Hours the server already holds (in-app or secure-link submission) outrank a draft cached in this browser.
  if (!hs.isDraft && (reqStatus === 'awaiting_review' || hs.status === 'awaiting_review' || hs.submittedAt)) {
    return 'awaiting_review';
  }

  // Check for draft
  if (record?.state === 'draft' || hs.isDraft) {
    return 'draft';
  }

  // Check for awaiting review / submitted
  if (record?.state === 'submitted' || record?.state === 'awaiting_review' || reqStatus === 'awaiting_review' || hs.status === 'awaiting_review' || hs.actualStartTime || hs.submittedAt) {
    return 'awaiting_review';
  }

  return 'not_submitted';
}

/**
 * State jobs (ODHH/HCA) send the interpreter to the state portal to report hours. Once TerpDesk holds hours for the job
 * (for example from the state's service-verification email) they are shown like any other job's hours instead; only a
 * job with no hours yet, a draft, or a correction request still points to the portal.
 */
export const showsStatePortal = (job: { isStateJob?: boolean } | null | undefined, state: HoursWorkflowState): boolean =>
  job?.isStateJob === true && state !== 'awaiting_review' && state !== 'approved';

export function isJobNeedingHours(job: any, serviceRecords: any[] = [], nowMs: number = Date.now()): boolean {
  if (!job) return false;
  // State jobs: hours are submitted in the state portal, not in TerpDesk.
  if (job.isStateJob === true) return false;
  const isBooked = job.status === 'booked' || job.status === 'accepted';
  if (!isBooked) return false;

  const hoursState = getJobHoursState(job, serviceRecords);

  // If agency requested a correction, it ALWAYS needs hours / resubmission
  if (hoursState === 'correction_requested') return true;

  // If already awaiting review or approved, it does not need submission
  if (hoursState === 'awaiting_review' || hoursState === 'approved') return false;

  // For not_submitted or draft: check if appointment has ended
  const { endsAt } = resolveRequestTimes(job);
  const endMs = endsAt ? new Date(endsAt).getTime() : 0;

  // Appointment has ended and hours are not submitted or draft
  return endMs > 0 && nowMs > endMs && (hoursState === 'not_submitted' || hoursState === 'draft');
}

export interface HoursBadgeInfo {
  state: HoursWorkflowState;
  label: string;
  badgeClass: string;
  isCorrection: boolean;
}

export function getHoursBadgeInfo(state: HoursWorkflowState): HoursBadgeInfo {
  switch (state) {
    case 'correction_requested':
      return {
        state,
        label: 'Correction requested',
        badgeClass: 'bg-amber-100 text-amber-900 border border-amber-300 font-semibold',
        isCorrection: true,
      };
    case 'awaiting_review':
      return {
        state,
        label: 'Awaiting review',
        badgeClass: 'bg-purple-100 text-purple-800 border border-purple-200 font-medium',
        isCorrection: false,
      };
    case 'approved':
      return {
        state,
        label: 'Hours approved',
        badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-medium',
        isCorrection: false,
      };
    case 'draft':
      return {
        state,
        label: 'Draft saved',
        badgeClass: 'bg-blue-100 text-blue-800 border border-blue-200 font-medium',
        isCorrection: false,
      };
    case 'not_submitted':
    default:
      return {
        state: 'not_submitted',
        label: 'Hours needed',
        badgeClass: 'bg-[#F5F4F0] text-gray-700 border border-gray-200 font-medium',
        isCorrection: false,
      };
  }
}

/**
 * The single `hoursSubmission` field from before team jobs. It only ever means Position 1: older code could copy
 * Position 2's hours into it when Position 2 submitted first, so a copy marked as Position 2 is ignored.
 */
export function legacyPosition1Hours(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const legacy = (data as { hoursSubmission?: unknown }).hoursSubmission;
  if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) return null;
  return (legacy as { positionIndex?: unknown }).positionIndex === 2 ? null : (legacy as Record<string, unknown>);
}

const TEAM_LABEL = "Team — two independent positions";

/** True for a two-interpreter (team) job, however the request stored it. */
export function isTeamRequestData(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const pick = (o: unknown): Record<string, unknown> => (o && typeof o === "object" ? (o as Record<string, unknown>) : {});
  return [d, pick(d.details), pick(d.intake)].some(
    (o) => o.slotCount === 2 || o.requiredPositions === 2 || o.positions === TEAM_LABEL,
  );
}

/**
 * The request-wide status, but ONLY where it can describe the viewer's own hours: on a team job it reflects both
 * positions, so it is never used for one interpreter's hours state (it returns "").
 */
export function scopedRequestStatus(job: { isTeamJob?: boolean; data?: unknown; requestStatus?: string; status?: string }): string {
  const team = job.isTeamJob ?? isTeamRequestData(job.data);
  return team ? "" : String(job.requestStatus || job.status || "").toLowerCase();
}

/** Browser-cached service records belong to ONE booking (offer), so another interpreter's never matches. */
export function findOwnServiceRecord<T extends { offerId?: unknown }>(records: T[] | null | undefined, job: { id?: unknown }): T | undefined {
  const offerId = String(job.id ?? "");
  if (!offerId || !Array.isArray(records)) return undefined;
  return records.find((r) => Boolean(r) && r.offerId === offerId);
}
