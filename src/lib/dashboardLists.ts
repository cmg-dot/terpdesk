import { countStartingLater, sortNeedsAttention } from "@/lib/needsAttention";
import { asAppointment } from "@/lib/requestListRow";
import type { RequestListRow } from "@/lib/requestListRow";
import { isAppointmentHappeningNow, isAppointmentUpcoming, sortUpcomingWithHappeningNow } from "@/utils/happeningNow";
import { getStaffingLabel, getStatusFilters } from "@/utils/statusEngine";

/** How many upcoming bookings the dashboard card shows. */
export const UPCOMING_BOOKINGS_SHOWN = 6;

export type NeedsAttentionJob = RequestListRow & { displayStatus: string };

export interface DashboardLists {
  /** Jobs that need someone: starting within a week first, then by urgency (see lib/needsAttention.ts). */
  needsAttention: NeedsAttentionJob[];
  /** How many of those start later than the attention horizon. */
  needsAttentionLaterCount: number;
  /** The next staffed appointments, the live ones first. */
  upcoming: RequestListRow[];
  /** Appointments with an interpreter booked that are in progress right now. */
  happeningNow: RequestListRow[];
  /** How many of `upcoming` are live. */
  upcomingHappeningNowCount: number;
}

/**
 * The dashboard's three lists at `nowMs`. Pure, and each one leaves out a job once its end time has passed, which is why the page only
 * needs the jobs that have not ended (see DashboardSummary.active). Every rule is the one the page always had; `nowMs` is passed in
 * so the page's minute clock decides, and so tests can pick the moment.
 */
export function buildDashboardLists(rows: readonly RequestListRow[], nowMs: number): DashboardLists {
  const needsAttention = sortNeedsAttention(
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

  const upcoming = sortUpcomingWithHappeningNow(
    rows.filter((row) => {
      const status = String(row.status ?? "").toLowerCase();
      if (status.includes("cancel")) return false;
      // A booking stays under upcoming until its end time has completely passed.
      if (!isAppointmentUpcoming(row, nowMs)) return false;
      return row.hasAcceptedOffer || status.includes("staffed") || status.includes("booked") || status.includes("assigned");
    }),
    nowMs,
  ).slice(0, UPCOMING_BOOKINGS_SHOWN);

  return {
    needsAttention,
    needsAttentionLaterCount: countStartingLater(needsAttention, nowMs),
    upcoming,
    happeningNow: rows.filter((row) => isAppointmentHappeningNow(row, nowMs)),
    upcomingHappeningNowCount: upcoming.filter((row) => isAppointmentHappeningNow(row, nowMs)).length,
  };
}
