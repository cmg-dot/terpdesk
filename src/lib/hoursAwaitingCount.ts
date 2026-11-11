import type { SubmittedTimesheet } from "@/app/actions/getSubmittedTimesheets";
import type { MappedRequest } from "@/lib/mapRequestRow";
import { isAwaitingReview, mergeHoursRecords } from "@/utils/hoursReviewRecords";

/** The only two facts about a submitted timesheet that the count needs: which job it is on, and its own id. */
export interface SubmittedTimesheetRef {
  timesheetId: string;
  requestId: string;
}

/** A submitted timesheet with everything the count never reads left empty. */
const submittedStub = (ref: SubmittedTimesheetRef): SubmittedTimesheet => ({
  timesheetId: ref.timesheetId,
  requestId: ref.requestId,
  title: "",
  reference: "",
  interpreterName: "",
  scheduledStart: "",
  scheduledEnd: "",
  actualStart: "",
  actualEnd: "",
  billableHours: 0,
  reportedMileage: 0,
  notes: "",
  signatureDataUrl: null,
  submittedAt: null,
  isOdhh: false,
  status: "submitted",
  approvedMileage: null,
  breakMinutes: 0,
  timeZone: "",
  travelStart: null,
  travelEnd: null,
  serviceCompleted: null,
  mileageNote: "",
  mileageAdjustmentReason: null,
  cancellationReason: null,
  travelLegs: [],
});

/**
 * The dashboard's "Hours awaiting review", counted on the server by the SAME rule the Hours review page uses: the records are built
 * by mergeHoursRecords and counted by isAwaitingReview (a voided, returned or cancelled job never counts). Only the browser's cached
 * copies are left out: the count is what the database says, which is what mergeHoursRecords itself treats as the truth.
 *
 * `submitted` is only the ids of timesheets in the "submitted" state. Approved ones can never be awaiting review, so they are not
 * read, and no signature, interpreter or request data is read for them.
 */
export function countHoursAwaitingReview(rows: readonly MappedRequest[], submitted: readonly SubmittedTimesheetRef[]): number {
  const records = mergeHoursRecords({ localRecords: [], requests: [...rows], timesheets: submitted.map(submittedStub) });
  return records.filter(isAwaitingReview).length;
}
