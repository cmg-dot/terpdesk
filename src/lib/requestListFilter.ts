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

/**
 * Closed and cancelled jobs are never "upcoming", so choosing one of these filters opens the Past tab instead of
 * leaving the person on an empty Upcoming tab. Other filters keep whichever tab is open.
 */
export function tabForFilter(filter: string): "past" | null {
  return filter === "Completed" || filter === "Cancelled" || filter === "Voided" || filter === "Returned" ? "past" : null;
}

export interface ListCopy {
  subtitle: string;
  pastHeading: string;
  pastNote: string;
}

const DEFAULT_COPY: ListCopy = {
  subtitle: "Upcoming appointments and unresolved past appointments",
  pastHeading: "Past — unresolved",
  pastNote: "These appointments still need coverage, an offer response, or access follow-up.",
};

export function listCopy(filter: string): ListCopy {
  switch (filter) {
    case "Completed":
      return { subtitle: "Completed appointments", pastHeading: "Past — completed", pastNote: "Appointments that have taken place and are closed." };
    case "Cancelled":
      return { subtitle: "Cancelled appointments", pastHeading: "Cancelled", pastNote: "Appointments that were cancelled. They are kept here for the record." };
    case "Voided":
      return { subtitle: "Voided appointments", pastHeading: "Voided", pastNote: "Jobs that should never have existed (wrong form, duplicates). They are kept for the record and are not billed." };
    case "Returned":
      return { subtitle: "Returned appointments", pastHeading: "Returned", pastNote: "Jobs the agency was unable to fill and returned to the state or requester. They are kept for the record and are not billed." };
    case "All appointments":
      return { subtitle: "Every appointment: upcoming, past, completed and cancelled", pastHeading: "Past and cancelled", pastNote: "Every appointment that has already ended or was cancelled." };
    default:
      return DEFAULT_COPY;
  }
}
