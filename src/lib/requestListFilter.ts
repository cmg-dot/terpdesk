import { isAppointmentHappeningNow } from "@/utils/happeningNow";
import { getStaffingLabel, getStatusFilters } from "@/utils/statusEngine";

/**
 * The status filter on the Requests & assignments page. Pure functions, no I/O.
 *  - "Appointments" (the default) lists everything except cancelled jobs.
 *  - "All appointments" bypasses every status rule: upcoming, past, completed and cancelled.
 *  - "Completed" is a closed job (request status or billing status "completed"); "Cancelled" is a cancelled one.
 */

export const STATUS_FILTER_OPTIONS = [
  "Appointments",
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
] as const;

export type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

type StatusFilterInput = Parameters<typeof getStatusFilters>[0];

/** A request as the list receives it from fetchLiveRequests. */
export type ListedRequest = StatusFilterInput & { isCompleted?: boolean };

export function matchesStatusFilter(req: ListedRequest, filter: string, currentTime: number): boolean {
  if (filter === "All appointments") return true;

  const flags = getStatusFilters(req);
  if (filter === "Cancelled") return flags.isCancelled;
  if (flags.isCancelled) return false;

  switch (filter) {
    case "Appointments":
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

/** The badge text on a list card: "Completed" for a closed job, else the usual staffing label. */
export function requestStatusLabel(req: ListedRequest): string {
  return req.isCompleted ? "Completed" : getStaffingLabel(req);
}

/**
 * Closed and cancelled jobs are never "upcoming", so choosing one of these filters opens the Past tab instead of
 * leaving the person on an empty Upcoming tab. Other filters keep whichever tab is open.
 */
export function tabForFilter(filter: string): "past" | null {
  return filter === "Completed" || filter === "Cancelled" ? "past" : null;
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
    case "All appointments":
      return { subtitle: "Every appointment: upcoming, past, completed and cancelled", pastHeading: "Past and cancelled", pastNote: "Every appointment that has already ended or was cancelled." };
    default:
      return DEFAULT_COPY;
  }
}
