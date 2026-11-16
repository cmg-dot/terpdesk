import { isAppointmentHappeningNow } from "@/utils/happeningNow";
import { getStaffingLabel, getStatusFilters } from "@/utils/statusEngine";

/**
 * The status filter on the Requests & assignments page. Pure functions, no I/O.
 *  - "Active Appointments" (the default) lists everything except cancelled jobs.
 *  - "All appointments" bypasses every status rule: upcoming, past, completed and cancelled.
 *  - "Completed" is a closed job (request status or billing status "completed"); "Cancelled" is a cancelled one;
 *    "Voided" and "Returned" (unable to fill) are closed jobs of their own, listed apart from real cancellations.
 */

export const DEFAULT_STATUS_FILTER = "Active Appointments";

export const STATUS_FILTER_OPTIONS = [
  DEFAULT_STATUS_FILTER,
  "All appointments",
  "Happening now",
  "Needing coverage",
  "Needs replacement",
  "Pending offers",
  "Partially staffed",
  "Fully staffed",
  "Staff follow-up",
  "Completed",
  "Cancelled",
  "Voided",
  "Returned",
] as const;

export type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

type StatusFilterInput = Parameters<typeof getStatusFilters>[0];

/** A request as the list receives it (a lean list row from fetchRequestList; see requestListRow.ts). */
export type ListedRequest = StatusFilterInput & { isCompleted?: boolean; isVoided?: boolean; isReturned?: boolean };

export function matchesStatusFilter(req: ListedRequest, filter: string, currentTime: number): boolean {
  if (filter === "All appointments") return true;

  const flags = getStatusFilters(req);
  // A voided job is closed like a cancelled one, but it has its own filter: "Cancelled" is the real cancellations only.
  if (filter === "Cancelled") return flags.isCancelled && !req.isVoided && !req.isReturned;
  if (filter === "Voided") return flags.isCancelled && Boolean(req.isVoided);
  // A job the agency could not fill and returned to the state: closed, kept for the record, never counted as a cancellation.
  if (filter === "Returned") return flags.isCancelled && Boolean(req.isReturned);
  if (flags.isCancelled) return false;

  switch (filter) {
    case DEFAULT_STATUS_FILTER:
      return true;
    case "Completed":
      return Boolean(req.isCompleted);
    case "Happening now":
      return isAppointmentHappeningNow(req, currentTime);
    case "Needing coverage":
      return flags.needingCoverage;
    case "Pending offers":
      return flags.hasPendingOffer;
    case "Partially staffed":
      return flags.partiallyStaffed || getStaffingLabel(req) === "Partially staffed";
    case "Fully staffed":
      return flags.fullyStaffed;
    case "Needs replacement":
      return flags.needsReplacement;
    case "Staff follow-up":
      return flags.staffFollowUp;
    default:
      return false;
  }
}

/** A cancelled job, by the same rule the "Cancelled" filter uses. */
export const isCancelledRequest = (req: ListedRequest): boolean => getStatusFilters(req).isCancelled;

/** The badge text on a list card: "Completed" for a closed job, else the usual staffing label. */
export function requestStatusLabel(req: ListedRequest): string {
  if (req.isVoided) return "Voided";
  if (req.isReturned) return "Returned";
  return req.isCompleted ? "Completed" : getStaffingLabel(req);
}

export const isStatusFilter = (value: string): value is StatusFilter => (STATUS_FILTER_OPTIONS as readonly string[]).includes(value);

/**
 * How the Requests list lays out each filter.
 *  - "split": jobs can sit on either side of their end time, so the list shows the Upcoming / Past toggle, with a note per tab.
 *  - "upcoming" / "past": every job the filter lets through is on one side (Happening now and Needing coverage have not ended;
 *    Staff follow-up has; cancelled, voided and returned jobs are closed whatever their date), so the toggle is hidden and the
 *    list is one section titled with the filter. A single section lists everything the filter matched, so no job is ever hidden.
 */
export type FilterView =
  | { scope: "split"; upcomingNote: string; pastNote: string }
  | { scope: "upcoming" | "past"; note: string; empty: string };

export const FILTER_VIEWS: Record<StatusFilter, FilterView> = {
  "Active Appointments": { scope: "split", upcomingNote: "Appointments that haven't ended.", pastNote: "Ended appointments, not cancelled." },
  "All appointments": { scope: "split", upcomingNote: "Everything that hasn't ended.", pastNote: "Ended, completed and cancelled appointments." },
  "Happening now": { scope: "upcoming", note: "Booked appointments in progress right now.", empty: "Nothing is in progress right now." },
  "Needing coverage": { scope: "upcoming", note: "Upcoming positions with no interpreter and no offer out.", empty: "Every upcoming position is covered or has an offer out." },
  "Needs replacement": { scope: "split", upcomingNote: "An interpreter dropped and the position is open again.", pastNote: "Ended with a position still open." },
  "Pending offers": { scope: "upcoming", note: "Offers waiting for an interpreter's answer.", empty: "No offers are waiting for an answer." },
  "Partially staffed": { scope: "split", upcomingNote: "Some positions booked, some open.", pastNote: "Ended with some positions open." },
  "Fully staffed": { scope: "split", upcomingNote: "Every position booked.", pastNote: "Ended with every position booked." },
  "Staff follow-up": { scope: "past", note: "Ended appointments with a position flagged for follow-up.", empty: "Nothing needs follow-up." },
  Completed: { scope: "past", note: "Closed appointments (job or billing marked completed).", empty: "No completed appointments match these filters." },
  Cancelled: { scope: "past", note: "Cancelled appointments, kept for the record.", empty: "No cancelled appointments match these filters." },
  Voided: { scope: "past", note: "Jobs that should never have existed (wrong form, duplicates). Kept for the record and not billed.", empty: "No voided appointments match these filters." },
  Returned: { scope: "past", note: "Jobs the agency was unable to fill and returned to the state or requester. Kept for the record and not billed.", empty: "No returned appointments match these filters." },
};
