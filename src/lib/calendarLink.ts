import { agencyDateKey } from "@/lib/agencyTime";

interface CalendarLinkSource {
  /** The request's id. */
  id: string;
  /** The appointment's start instant (ISO text); its Los Angeles day is the `date`. */
  startsAt?: string | null;
  /** The state's service request number, when the job has one. */
  srn?: string | null;
}

/**
 * The "View in calendar" address: /calendar?date=yyyy-MM-dd&jobId=…&srn=…. The date is the appointment's day in the
 * agency's zone (America/Los_Angeles), so the calendar opens on the right day whatever zone this browser is in. A request
 * with no readable start time simply leaves the date out, and one with no SRN leaves that out.
 */
export const calendarLink = ({ id, startsAt, srn }: CalendarLinkSource): string => {
  const params = new URLSearchParams();
  if (startsAt) {
    try {
      params.set("date", agencyDateKey(startsAt));
    } catch {
      // not a real time: open the calendar without a date
    }
  }
  params.set("jobId", id);
  if (srn) params.set("srn", srn);
  return `/calendar?${params.toString()}`;
};
