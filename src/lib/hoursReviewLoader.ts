import { inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "@/db";
import { requests, timesheets } from "@/db/schema";
import { getSubmittedTimesheets } from "@/app/actions/getSubmittedTimesheets";
import type { SubmittedTimesheet } from "@/app/actions/getSubmittedTimesheets";
import { toHoursRow } from "@/lib/hoursRequestRow";
import type { HoursRequestRow } from "@/lib/hoursRequestRow";
import { loadRequestRows } from "@/lib/requestRows";

/** Everything the hours review merges into its records. */
export interface HoursReviewData {
  requests: HoursRequestRow[];
  timesheets: SubmittedTimesheet[];
}

/** The request statuses that can make a hours record by themselves (see mergeHoursRecords: `isEligibleStatus`). */
const HOURS_STATUSES = ["awaiting_review", "correction_requested", "approved"];

/**
 * The requests the hours review can need: a SUPERSET of those that can produce a record, so leaving the rest out cannot change what
 * the merge builds (the merge itself decides who really has hours). A request is needed when:
 *  - it holds hours of its own (a state job's hours are stored on the request: `hoursSubmissions`, or the older single `hoursSubmission`),
 *  - its status alone makes a record (awaiting review, correction requested, approved),
 *  - a submitted or approved timesheet is on it (the record needs the job's close-out state and mirrored position), or
 *  - the browser's cached records name it (they are kept or dropped by whether the request still exists).
 * That is about 8% of all requests today.
 */
const hoursCandidates = (cachedRequestIds: readonly string[]): SQL => {
  const hoursJson = sql`${requests.data} -> 'hoursSubmissions'`;
  const filters: SQL[] = [
    sql`(${hoursJson}) is not null and (${hoursJson}) <> '{}'::jsonb and (${hoursJson}) <> 'null'::jsonb`,
    sql`jsonb_typeof(${requests.data} -> 'hoursSubmission') = 'object'`,
    inArray(requests.status, HOURS_STATUSES),
    inArray(requests.id, db.select({ id: timesheets.requestId }).from(timesheets).where(inArray(timesheets.status, ["submitted", "approved"]))),
  ];
  if (cachedRequestIds.length > 0) filters.push(inArray(requests.id, [...cachedRequestIds]));
  return or(...filters) as SQL;
};

/**
 * The hours review's data: the submitted and approved timesheets, and only the requests above, cut down to what the merge reads
 * (hoursRequestRow.ts). The two are read together. A timesheet read that fails leaves the timesheets empty, as the page always
 * tolerated. The agency-only guard belongs to the caller. SERVER ONLY.
 */
export async function loadHoursReviewData(cachedRequestIds: readonly string[]): Promise<HoursReviewData> {
  const [mapped, submitted] = await Promise.all([
    loadRequestRows("open", hoursCandidates(cachedRequestIds)),
    getSubmittedTimesheets().catch((): SubmittedTimesheet[] => []),
  ]);
  return { requests: mapped.map(toHoursRow), timesheets: submitted };
}
