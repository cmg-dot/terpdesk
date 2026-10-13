import { resolveRequestTimes } from "./timezone";

/**
 * Utility functions for detecting and prioritizing appointments that are currently in progress ("Happening now").
 */

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

  const { startsAt, endsAt } = resolveRequestTimes(job);
  if (!startsAt || !endsAt) return false;

  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (isNaN(start) || isNaN(end)) return false;

  return nowMs >= start && nowMs <= end;
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

  // Booking remains categorized under upcoming until its endsAt time has completely passed
  return nowMs <= end;
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

