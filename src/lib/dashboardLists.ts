import { countStartingLater, sortNeedsAttention } from "@/lib/needsAttention";
import { asAppointment } from "@/lib/requestListRow";
import type { RequestListRow } from "@/lib/requestListRow";
import { isAppointmentHappeningNow, isAppointmentUpcoming, sortUpcomingWithHappeningNow } from "@/utils/happeningNow";
import { getStaffingLabel, getStatusFilters } from "@/utils/statusEngine";

/** How many upcoming bookings the dashboard card shows. */
export const UPCOMING_BOOKINGS_SHOWN = 6;

export type NeedsAttentionJob = RequestListRow & { displayStatus: string };

/** Jobs that need someone: starting within a week first, then by urgency (see lib/needsAttention.ts). Leaves out a job that has ended. */
export function needsAttentionOf(rows: readonly RequestListRow[], nowMs: number): NeedsAttentionJob[] {
  return sortNeedsAttention(
    rows
      .filter((row) => {
        const filters = getStatusFilters(asAppointment(row), nowMs);
        if (filters.isCancelled) return false;
        if (row.endsAt && nowMs > new Date(row.endsAt).getTime()) return false;
        if (filters.fullyStaffed && !filters.staffFollowUp && !filters.hasPendingOffer) return false;
        return filters.needsReplacement || filters.needingCoverage || filters.hasPendingOffer || filters.staffFollowUp || filters.partiallyStaffed;
      })
      .map((row) => ({ ...row, displayStatus: getStaffingLabel(asAppointment(row), nowMs) })),
    nowMs,
  );
}

/** The next staffed appointments, the live ones first. A booking stays under upcoming until its end time has completely passed. */
export function upcomingOf(rows: readonly RequestListRow[], nowMs: number, limit: number = UPCOMING_BOOKINGS_SHOWN): RequestListRow[] {
  return sortUpcomingWithHappeningNow(
    rows.filter((row) => {
      const status = String(row.status ?? "").toLowerCase();
      if (status.includes("cancel")) return false;
      if (!isAppointmentUpcoming(row, nowMs)) return false;
      return row.hasAcceptedOffer || status.includes("staffed") || status.includes("booked") || status.includes("assigned");
    }),
    nowMs,
  ).slice(0, limit);
}

/** Appointments with an interpreter booked that are in progress right now. */
export const happeningNowOf = (rows: readonly RequestListRow[], nowMs: number): RequestListRow[] =>
  rows.filter((row) => isAppointmentHappeningNow(row, nowMs));

export interface DashboardLists {
  needsAttention: NeedsAttentionJob[];
  /** How many of those start later than the attention horizon. */
  needsAttentionLaterCount: number;
  upcoming: RequestListRow[];
  happeningNow: RequestListRow[];
  /** How many of `upcoming` are live. */
  upcomingHappeningNowCount: number;
}

/**
 * All three lists at `nowMs` from one array of jobs. Pure, and each leaves out a job once its end time has passed. The server uses this
 * over every job that has not ended (with a larger `upcomingLimit`, to keep a few spare); the page uses the three functions above on
 * the few rows it was sent (see dashboardViewOf in dashboardView.ts).
 */
export function buildDashboardLists(rows: readonly RequestListRow[], nowMs: number, upcomingLimit: number = UPCOMING_BOOKINGS_SHOWN): DashboardLists {
  const needsAttention = needsAttentionOf(rows, nowMs);
  const upcoming = upcomingOf(rows, nowMs, upcomingLimit);
  return {
    needsAttention,
    needsAttentionLaterCount: countStartingLater(needsAttention, nowMs),
    upcoming,
    happeningNow: happeningNowOf(rows, nowMs),
    upcomingHappeningNowCount: happeningNowOf(upcoming, nowMs).length,
  };
}
