import { isAppointmentUpcoming, sortUpcomingWithHappeningNow } from "@/utils/happeningNow";

/**
 * How an interpreter's own jobs are grouped on Home and Jobs: Upcoming (live offers and bookings still ahead), Completed (bookings
 * whose time has passed) and Cancelled (bookings the agency cancelled). Anything the interpreter no longer holds or can act on
 * (declined, withdrawn, taken by someone else, expired, given back) is in none of them. Pure.
 */

export interface BucketJob {
  /** "pending" (an offer), "booked" (an accepted offer), "cancelled", or a closed state (declined, withdrawn, expired, returned, released). */
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
  /** The offer's own response deadline (offers.expires_at). */
  offerExpiresAt?: string | null;
}

const ms = (value: string | null | undefined): number => (value ? new Date(value).getTime() : NaN);

/**
 * An offer the interpreter can still answer: pending, its response deadline not passed, and the appointment not over. The deadline is
 * what the server checks on Accept, so an offer past it is never shown as something to act on.
 */
export function isLivePendingOffer(job: BucketJob, nowMs: number): boolean {
  if (job.status !== "pending") return false;
  const deadline = ms(job.offerExpiresAt);
  if (!Number.isNaN(deadline) && deadline <= nowMs) return false;
  return isAppointmentUpcoming(job, nowMs);
}

export interface JobBuckets<T> {
  upcoming: T[];
  completed: T[];
  cancelled: T[];
}

export function bucketInterpreterJobs<T extends BucketJob>(jobs: readonly T[], nowMs: number): JobBuckets<T> {
  const upcoming: T[] = [];
  const completed: T[] = [];
  const cancelled: T[] = [];
  for (const job of jobs) {
    if (job.status === "cancelled") cancelled.push(job);
    else if (job.status === "booked") (isAppointmentUpcoming(job, nowMs) ? upcoming : completed).push(job);
    else if (isLivePendingOffer(job, nowMs)) upcoming.push(job);
  }
  const newestFirst = (a: T, b: T) => (ms(b.startsAt) || 0) - (ms(a.startsAt) || 0);
  return { upcoming: sortUpcomingWithHappeningNow(upcoming, nowMs), completed: completed.sort(newestFirst), cancelled: cancelled.sort(newestFirst) };
}
