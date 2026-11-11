import { happeningNowOf, needsAttentionOf, upcomingOf } from "@/lib/dashboardLists";
import type { NeedsAttentionJob } from "@/lib/dashboardLists";
import type { DashboardSummary } from "@/lib/dashboardSummary";
import type { RequestListRow } from "@/lib/requestListRow";
import { countStartingLater } from "@/lib/needsAttention";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";

/** What the dashboard shows at the page's clock. */
export interface DashboardView {
  needsAttention: NeedsAttentionJob[];
  /** How many jobs need attention in all (the list above is only the most urgent of them). */
  needsAttentionTotal: number;
  /** Of the jobs in `needsAttention`, how many start later than the attention horizon. */
  needsAttentionLaterCount: number;
  upcoming: RequestListRow[];
  happeningNow: RequestListRow[];
  upcomingHappeningNowCount: number;
}

const NONE: readonly RequestListRow[] = [];

/** Each job once: a live job is both "happening now" and "upcoming". */
const uniqueById = (rows: readonly RequestListRow[]): RequestListRow[] => {
  const seen = new Set<string>();
  return rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
};

/**
 * The summary the server sent, filtered by the page's own clock, so a job drops off the minute it ends and goes live the minute it
 * starts without another read. Each list is worked out from its own few rows. "Happening now" also watches the upcoming list, since a
 * job about to start is the next one in it. Pure.
 */
export function dashboardViewOf(summary: DashboardSummary | null, nowMs: number): DashboardView {
  if (!summary) return { needsAttention: [], needsAttentionTotal: 0, needsAttentionLaterCount: 0, upcoming: [], happeningNow: [], upcomingHappeningNowCount: 0 };
  const needsAttention = needsAttentionOf(summary.needsAttention.jobs, nowMs);
  const upcoming = upcomingOf(summary.upcoming, nowMs);
  // The server counted every job; the page can only have dropped some of the ones it was sent.
  const dropped = summary.needsAttention.jobs.length - needsAttention.length;
  return {
    needsAttention,
    needsAttentionTotal: Math.max(summary.needsAttention.total - dropped, needsAttention.length),
    needsAttentionLaterCount: countStartingLater(needsAttention, nowMs),
    upcoming,
    happeningNow: happeningNowOf(uniqueById([...(summary.happeningNow ?? NONE), ...summary.upcoming]), nowMs),
    upcomingHappeningNowCount: upcoming.filter((row) => isAppointmentHappeningNow(row, nowMs)).length,
  };
}
