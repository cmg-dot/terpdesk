import { buildDashboardLists } from "@/lib/dashboardLists";
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

/** How many jobs each dashboard list is sent with. The rest are on the Requests page. */
export const DASHBOARD_LIST_SIZE = 15;

export interface DashboardSummary {
  /** When the figures were worked out (ISO). They are refreshed by reading again, not by the page's clock. */
  generatedAt: string;
  counts: DashboardCounts;
  /** The most urgent jobs, and how many need attention in all (and how many of those start later than the attention horizon). */
  needsAttention: { jobs: RequestListRow[]; total: number; laterCount: number };
  /** The next staffed appointments, the live ones first: a few spare, because the page drops each one the minute it ends. */
  upcoming: RequestListRow[];
  /** Appointments in progress at the moment of the read. The page also watches `upcoming` so a job goes live the minute it starts. */
  happeningNow: RequestListRow[];
}

/**
 * How long past its end a job still counts as active. The page's clock may be a little behind the server's, and it re-filters by its
 * own time, so a small margin means a job is never dropped early.
 */
export const ACTIVE_GRACE_MS = 60 * 60 * 1000;

/** A mapped request viewed as the appointment the status engine reads (the same view the list filters take). */
const asAppointment = (row: MappedRequest): Appointment => row as unknown as Appointment;

/** True while the job could still show on the dashboard: not ended (or no usable end time), within the grace margin. */
const isStillActive = (row: MappedRequest, nowMs: number): boolean => {
  const end = row.endsAt ? new Date(row.endsAt).getTime() : Number.NaN;
  return Number.isNaN(end) || end >= nowMs - ACTIVE_GRACE_MS;
};

/** A list row without the extra field the needs-attention list adds (the page works the label out again at its own clock). */
const plain = ({ displayStatus: _label, ...row }: RequestListRow & { displayStatus?: string }): RequestListRow => row;

/**
 * The dashboard's figures and its three short lists, worked out from every mapped request with the SAME predicates the Requests list
 * filters use (getStatusFilters), so a card's number is always the length of the list its link opens. The six figures count every job;
 * the lists are cut from the jobs that have not ended, and only the top DASHBOARD_LIST_SIZE of each are sent. Pure: no database.
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
  const lists = buildDashboardLists(active, nowMs, DASHBOARD_LIST_SIZE);
  return {
    generatedAt: new Date(nowMs).toISOString(),
    counts,
    needsAttention: { jobs: lists.needsAttention.slice(0, DASHBOARD_LIST_SIZE).map(plain), total: lists.needsAttention.length, laterCount: lists.needsAttentionLaterCount },
    upcoming: lists.upcoming,
    happeningNow: lists.happeningNow,
  };
}
