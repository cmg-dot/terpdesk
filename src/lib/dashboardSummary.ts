import type { MappedRequest } from "@/lib/mapRequestRow";
import { toListRow } from "@/lib/requestListRow";
import type { RequestListRow } from "@/lib/requestListRow";
import { getStatusFilters } from "@/utils/statusEngine";
import type { Appointment } from "@/utils/statusEngine";

/** The six figures on the dashboard's dark card. */
export interface DashboardCounts {
  appointments: number;
  needingCoverage: number;
  pendingOffers: number;
  staffFollowUp: number;
  needsReplacement: number;
  hoursAwaitingReview: number;
}

export interface DashboardSummary {
  /** When the figures were worked out (ISO). They are refreshed by reloading, not by the page's clock. */
  generatedAt: string;
  counts: DashboardCounts;
  /**
   * The jobs that have not ended yet: the only ones "Needs attention", "Upcoming bookings" and the live banner can ever show (each of
   * them leaves out a job once its end time has passed). The page keeps filtering these by its own clock, so a job drops off the
   * minute it ends. The old past ones are never sent.
   */
  active: RequestListRow[];
}

/**
 * How long past its end a job still rides along. The page's clock may be a little behind the server's, and it re-filters by its own
 * time, so a small margin costs nothing and means a job is never dropped early.
 */
export const ACTIVE_GRACE_MS = 60 * 60 * 1000;

/** A mapped request viewed as the appointment the status engine reads (the same view the list filters take). */
const asAppointment = (row: MappedRequest): Appointment => row as unknown as Appointment;

/** True while the job could still show on the dashboard: not ended (or no usable end time), within the grace margin. */
const isStillActive = (row: MappedRequest, nowMs: number): boolean => {
  const end = row.endsAt ? new Date(row.endsAt).getTime() : Number.NaN;
  return Number.isNaN(end) || end >= nowMs - ACTIVE_GRACE_MS;
};

/**
 * The dashboard's figures, worked out from every mapped request with the SAME predicates the Requests list filters use
 * (getStatusFilters), so a card's number is always the length of the list its link opens. Pure: no database.
 */
export function buildDashboardSummary(rows: readonly MappedRequest[], hoursAwaitingReview: number, nowMs: number): DashboardSummary {
  const counts: DashboardCounts = { appointments: 0, needingCoverage: 0, pendingOffers: 0, staffFollowUp: 0, needsReplacement: 0, hoursAwaitingReview };
  const active: RequestListRow[] = [];
  for (const row of rows) {
    const flags = getStatusFilters(asAppointment(row), nowMs);
    if (!flags.isCancelled) counts.appointments += 1;
    if (flags.needingCoverage) counts.needingCoverage += 1;
    if (flags.hasPendingOffer) counts.pendingOffers += 1;
    if (flags.staffFollowUp) counts.staffFollowUp += 1;
    if (flags.needsReplacement) counts.needsReplacement += 1;
    if (isStillActive(row, nowMs)) active.push(toListRow(row));
  }
  return { generatedAt: new Date(nowMs).toISOString(), counts, active };
}
