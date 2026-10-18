import { resolveRequestTimes } from "./timezone";

/**
 * Utility functions for detecting and prioritizing appointments that are currently in progress ("Happening now").
 */

/**
 * True when an interpreter is actually booked on the job. "Happening now" is only meaningful then;
 * an unfilled request that has reached its start time is overdue, not live.
 */
export function isInterpreterAssigned(
  job: { status?: string | null; state?: string | null; [key: string]: any } | null | undefined,
): boolean {
  if (!job) return false;
  const status = String(job.status || job.state || '').toLowerCase();
  if (status.includes('cancel') || status === 'declined' || status === 'released') return false;
  return (
    job.hasAcceptedOffer === true ||
    Number(job.staffedCount ?? 0) > 0 ||
    Number(job.acceptedInterpretersCount ?? 0) > 0 ||
    /booked|assigned|staffed/.test(status)
  );
}

/** A draft / unfilled request whose start time has arrived without anyone booked. */
export function isUnfilledPastDue(
  job: { startsAt?: string | Date | null; status?: string | null; state?: string | null; [key: string]: any } | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!job) return false;
  const status = String(job.status || job.state || '').toLowerCase();
  if (status.includes('cancel')) return false;
  if (!(status.includes('draft') || status.includes('unfilled'))) return false;
  if (isInterpreterAssigned(job)) return false;
  const { startsAt } = resolveRequestTimes(job);
  const start = new Date(startsAt).getTime();
  return !isNaN(start) && nowMs >= start;
}

export function isAppointmentHappeningNow(
  job: {
    startsAt?: string | Date | null;
    endsAt?: string | Date | null;
    status?: string | null;
    state?: string | null;
    [key: string]: any;
  } | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!job) return false;

  const status = String(job.status || job.state || '').toLowerCase();
  if (status.includes('cancel') || status === 'declined' || status === 'released') {
    return false;
  }

  // Only a booked interpreter makes an appointment "live"; unfilled drafts show as past due instead.
  if (!isInterpreterAssigned(job)) return false;

  const { startsAt, endsAt } = resolveRequestTimes(job);
  if (!startsAt || !endsAt) return false;

  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (isNaN(start) || isNaN(end)) return false;

  // Strictly inside the window: the instant the end time arrives it is no longer live.
  return nowMs >= start && nowMs < end;
}

export function isAppointmentUpcoming(
  job: {
    startsAt?: string | Date | null;
    endsAt?: string | Date | null;
    status?: string | null;
    state?: string | null;
    [key: string]: any;
  } | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!job) return false;

  const status = String(job.status || job.state || '').toLowerCase();
  if (status.includes('cancel') || status === 'declined' || status === 'released') {
    return false;
  }

  const { endsAt } = resolveRequestTimes(job);
  if (!endsAt) return true;

  const end = new Date(endsAt).getTime();
  if (isNaN(end)) return true;

  // Booking remains categorized under upcoming until its endsAt time has passed
  return nowMs < end;
}

/**
 * True once the appointment's end instant has passed. Uses absolute UTC time from resolveRequestTimes,
 * which interprets naive times in the job's own zone, so PDT / AKDT / etc. cannot skew the result.
 */
export function isAppointmentPast(
  job: { startsAt?: string | Date | null; endsAt?: string | Date | null; [key: string]: any } | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!job) return false;
  const { endsAt } = resolveRequestTimes(job);
  if (!endsAt) return false;
  const end = new Date(endsAt).getTime();
  if (isNaN(end)) return false;
  return nowMs >= end;
}

export function sortUpcomingWithHappeningNow<T extends { startsAt?: string | Date | null; endsAt?: string | Date | null; [key: string]: any }>(
  jobs: T[],
  nowMs: number = Date.now()
): T[] {
  return [...jobs].sort((a, b) => {
    const aHappening = isAppointmentHappeningNow(a, nowMs);
    const bHappening = isAppointmentHappeningNow(b, nowMs);

    // Happening now appointments are prioritized to the very front/top
    if (aHappening && !bHappening) return -1;
    if (!aHappening && bHappening) return 1;

    // Subsequent appointments sorted in chronological order
    const aTimes = resolveRequestTimes(a);
    const bTimes = resolveRequestTimes(b);

    const timeA = aTimes?.startsAt ? new Date(aTimes.startsAt).getTime() : 0;
    const timeB = bTimes?.startsAt ? new Date(bTimes.startsAt).getTime() : 0;

    return timeA - timeB;
  });
}

