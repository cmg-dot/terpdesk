/**
 * Regression test: a cached hours record (browser `terpdesk_service_records`) whose timesheet no longer exists must never be shown.
 *
 * What went wrong: the merge dropped a cached record tied to a missing timesheet only when it was NOT approved, and the hours review
 * writes the merged list back to the cache on every load. So an approved cached copy of a deleted test timesheet stayed for good and kept
 * showing in the Approved tab ("APT-ABF099", "Ralph Silva", 1 minute, 1999 mi) although nothing was left in the database.
 *
 * Pure: no database, no environment. Run:  npx tsx scratch/test-hours-ghost-records.ts   (exit code 1 on any failure)
 */
import type { SubmittedTimesheet } from "../src/app/actions/getSubmittedTimesheets";
import type { HoursRequestRow } from "../src/lib/hoursRequestRow";
import { isAwaitingReview, mergeHoursRecords } from "../src/utils/hoursReviewRecords";
import type { ServiceRecord } from "../src/utils/hoursReviewRecords";

let failures = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (!ok) failures += 1;
  console.log(ok ? "PASS" : "FAIL", name, ok ? "" : detail);
};
const json = (value: unknown): string => JSON.stringify(value);

// --- what the database holds -------------------------------------------------------------------------------------------------------
const REAL_REQUEST = "11111111-1111-4111-8111-111111111111";
const REAL_SHEET_APPROVED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const REAL_SHEET_SUBMITTED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const OTHER_REQUEST = "22222222-2222-4222-8222-222222222222";
const NO_HOURS_REQUEST = "33333333-3333-4333-8333-333333333333";

const request = (id: string, title: string): HoursRequestRow => ({
  id,
  title,
  status: "booked",
  startsAt: "2026-10-21T18:00:00.000Z",
  endsAt: "2026-10-21T19:00:00.000Z",
  isStateJob: false,
  canceledAt: null,
  travelStartTime: null,
  travelEndTime: null,
  serviceCompleted: null,
  requester: { org: "Harbor Clinic" },
  details: { timeZone: "America/Los_Angeles" },
  offers: [],
  data: { intake: { program: "General" } },
});

const timesheet = (timesheetId: string, requestId: string, status: "submitted" | "approved", title: string): SubmittedTimesheet => ({
  timesheetId,
  requestId,
  title,
  reference: "APT-REAL01",
  interpreterName: "Real Interpreter",
  scheduledStart: "2026-10-21T18:00:00.000Z",
  scheduledEnd: "2026-10-21T19:00:00.000Z",
  actualStart: "2026-10-21T18:05:00.000Z",
  actualEnd: "2026-10-21T19:20:00.000Z",
  billableHours: 1.25,
  reportedMileage: 12,
  notes: "",
  signatureDataUrl: "data:image/png;base64,AAAA",
  submittedAt: "2026-10-21T20:00:00.000Z",
  isOdhh: false,
  status,
  approvedMileage: status === "approved" ? 12 : null,
  breakMinutes: 0,
  timeZone: "America/Los_Angeles",
  travelStart: null,
  travelEnd: null,
  serviceCompleted: null,
  mileageNote: "",
  mileageAdjustmentReason: null,
  cancellationReason: null,
  travelLegs: [],
});

const requests: HoursRequestRow[] = [request(REAL_REQUEST, "Real job"), request(OTHER_REQUEST, "Another real job"), request(NO_HOURS_REQUEST, "A job with no hours")];
const timesheets: SubmittedTimesheet[] = [
  timesheet(REAL_SHEET_APPROVED, REAL_REQUEST, "approved", "Real job"),
  timesheet(REAL_SHEET_SUBMITTED, OTHER_REQUEST, "submitted", "Another real job"),
];

// --- what an old browser cache holds: three approved test jobs that have since been deleted ------------------------------------------
const GHOSTS = [
  { request: "abf099a7-49bf-49ea-856f-d4857fa9864d", sheet: "78dc359b-6387-40c6-b168-9168b3d23311" },
  { request: "c975eeb2-295c-4000-9362-e44cb6519214", sheet: "3beee790-0999-482d-b60c-b73bace37e4d" },
  { request: "1542db65-77f8-47f3-a79d-583b05ef64b3", sheet: "32ec400f-ffaf-4ead-b837-bba4a134914b" },
];
const ghost = (n: number, over: Partial<ServiceRecord> = {}): ServiceRecord => ({
  id: `ts-${GHOSTS[n].sheet}`,
  timesheetId: GHOSTS[n].sheet,
  appointmentId: GHOSTS[n].request,
  interpreterName: "Ralph Silva",
  state: "approved",
  scheduledStart: "2026-10-21T18:00:00.000Z",
  scheduledEnd: "2026-10-21T19:00:00.000Z",
  actualStart: "2026-10-21T18:00:00.000Z",
  actualEnd: "2026-10-21T18:01:00.000Z",
  breakMinutes: 0,
  reportedMileage: 1999,
  approvedMileage: 1999,
  reviewMessage: null,
  version: 1,
  history: [],
  signatureDataUrl: null,
  ...over,
});
const allGhosts = (): ServiceRecord[] => GHOSTS.map((_, n) => ghost(n));
const isGhost = (record: ServiceRecord): boolean => GHOSTS.some((g) => g.request === record.appointmentId || g.sheet === record.timesheetId);
const merge = (localRecords: ServiceRecord[]): ServiceRecord[] => mergeHoursRecords({ localRecords, requests, timesheets });
/** What the page does after each load: it saves the merged list (signatures stripped) as the new browser cache. */
const saved = (records: ServiceRecord[]): ServiceRecord[] => records.map((r) => ({ ...r, signatureDataUrl: null }));

// --- the checks ----------------------------------------------------------------------------------------------------------------------
const clean = merge([]);
check("set-up: the database alone gives the two real timesheet records", clean.length === 2 && clean.every((r) => r.timesheetId !== undefined));

const withGhosts = merge([...saved(clean), ...allGhosts()]);
check("the approved cached copies of the 3 deleted timesheets are NOT shown", !withGhosts.some(isGhost), json(withGhosts.filter(isGhost).map((r) => r.id)));
check("...and nothing else changes: the result is identical to having no ghosts in the cache", json(withGhosts) === json(merge(saved(clean))));
check("...and identical to having no cache at all", json(withGhosts) === json(clean));

for (const state of ["submitted", "awaiting_review", "correction_requested", "changes_requested", "approved", "draft", "not_started"] as const) {
  check(`a cached record of a missing timesheet is dropped in state "${state}"`, !merge([ghost(0, { state })]).some(isGhost));
}
check("a cached record with no timesheet and no job is dropped (as before)", !merge([ghost(0, { timesheetId: undefined })]).some(isGhost));

const realApproved = clean.find((r) => r.timesheetId === REAL_SHEET_APPROVED);
check("an approved timesheet that EXISTS in the database stays approved", realApproved?.state === "approved" && realApproved.approvedMileage === 12);
const keptWithCache = merge([...saved(clean), ghost(0)]).find((r) => r.timesheetId === REAL_SHEET_APPROVED);
check("...and its cached copy is kept as that same approved record", keptWithCache?.state === "approved" && json(keptWithCache) === json(realApproved));
const staleApproved = merge([{ ...saved(clean).find((r) => r.timesheetId === REAL_SHEET_SUBMITTED)!, state: "approved" }]).find((r) => r.timesheetId === REAL_SHEET_SUBMITTED);
check("a SUBMITTED timesheet is never turned approved by a stale cached copy: the database wins", staleApproved !== undefined && isAwaitingReview(staleApproved));

const cachedOnlyOfRealJob: ServiceRecord = ghost(0, { id: "cached-only", timesheetId: undefined, appointmentId: NO_HOURS_REQUEST, state: "submitted" });
check("a cached record of a job that still exists (no timesheet) is kept, as before", merge([cachedOnlyOfRealJob]).some((r) => r.id === "cached-only"));

// The page re-saves the merged list on every load; the ghosts must not come back, and must not return when an old cache reappears.
let cache: ServiceRecord[] = [...allGhosts()];
const seen: string[] = [];
for (let load = 1; load <= 3; load += 1) {
  const shown = merge(cache);
  seen.push(shown.some(isGhost) ? "ghost" : "clean");
  cache = saved(shown);
}
check("across 3 page loads (each saving the merged list back to the cache) no ghost ever appears", seen.every((s) => s === "clean"), seen.join());
check("the saved cache no longer holds them", !cache.some(isGhost));
check("an OLD cache restored later (another tab, a backup) is pruned again", !merge([...cache, ...allGhosts()]).some(isGhost));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
