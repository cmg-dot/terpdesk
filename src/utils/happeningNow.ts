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

  const startStr = job.startsAt || ((job as any).details?.startDate
    ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}`
    : null);
  const endStr = job.endsAt || ((job as any).details?.endDate
    ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}`
    : null);

  if (!startStr) return false;

  const start = new Date(startStr).getTime();
  if (isNaN(start)) return false;

  const end = endStr ? new Date(endStr).getTime() : start;
  if (isNaN(end)) return false;

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

  const endStr = job.endsAt || ((job as any).details?.endDate
    ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}`
    : null);
  const startStr = job.startsAt || ((job as any).details?.startDate
    ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}`
    : null);

  if (!endStr && !startStr) return true;

  const end = endStr
    ? new Date(endStr).getTime()
    : (startStr ? new Date(startStr).getTime() : null);

  if (!end || isNaN(end)) return true;

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
    const aStartStr = a.startsAt || ((a as any).details?.startDate
      ? `${(a as any).details.startDate}T${(a as any).details.startTime || '00:00'}`
      : null);
    const bStartStr = b.startsAt || ((b as any).details?.startDate
      ? `${(b as any).details.startDate}T${(b as any).details.startTime || '00:00'}`
      : null);

    const timeA = aStartStr ? new Date(aStartStr).getTime() : 0;
    const timeB = bStartStr ? new Date(bStartStr).getTime() : 0;

    return timeA - timeB;
  });
}
