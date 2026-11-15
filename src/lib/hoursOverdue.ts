import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { offers, requests, timesheets } from "@/db/schema";
import { HOURS_SLA_BUSINESS_HOURS, addBusinessHours, hoursSlaStart } from "@/lib/businessHours";
import { isPlainSingle, positionOfOffer } from "@/lib/positions";
import { isStateJobRequest } from "@/lib/stateJob";
import { isVoidedData } from "@/lib/voidReasons";
import { legacyPosition1Hours } from "@/utils/hoursState";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * The 48-business-hour rule for submitting hours: once a booked appointment has ended, its interpreter has 48 business hours
 * (Mon-Fri, Pacific; see businessHours.ts) to submit hours in terpDESK, or, on a state job, the state's Verification Form (which
 * reaches terpDESK as an assignment report). Past that, the booking is overdue until hours arrive. Only appointments ending on or after
 * HOURS_SLA_START count. One list for the interpreter's banner and the daily reminder cron, so both always agree.
 *
 * Nothing here is shown to anyone but that interpreter (and the cron that emails them). Ids and times only: no job details. SERVER ONLY.
 */

export interface OverdueHours {
  requestId: string;
  offerId: string;
  interpreterId: string;
  position: number;
  isStateJob: boolean;
  /** UTC ISO instants. */
  endsAt: string;
  dueAt: string;
}

/** The fields of an accepted booking the rule reads. */
export interface BookingRow {
  offerId: string;
  requestId: string;
  interpreterId: string;
  status: string;
  isStateJob: boolean | null;
  createdAt: Date;
  data: unknown;
}

/** Request statuses that mean hours are already in (one-position jobs), and the ones that close a team job. */
const HOURS_IN_STATUSES = ["awaiting_review", "correction_requested", "changes_requested", "approved", "completed", "billed"];
const TEAM_CLOSED_STATUSES = ["approved", "completed", "billed"];

type Loose = Record<string, unknown>;
const asObject = (v: unknown): Loose => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Loose) : {});

/** This position's own hours are on the job (submitted in the app or through a link), not just a draft. */
function positionHasHours(data: unknown, position: number): boolean {
  const entry = asObject(asObject(data).hoursSubmissions)[String(position)] ?? (position === 1 ? legacyPosition1Hours(data) : null);
  return typeof entry === "object" && entry !== null && (entry as Loose).isDraft !== true;
}

/**
 * The overdue bookings among `rows` at `now`. `submittedSheets` holds "requestId:interpreterId" for every submitted or approved
 * timesheet (state assignment reports become one). Pure.
 */
export function findOverdue(rows: readonly BookingRow[], submittedSheets: ReadonlySet<string>, now: Date, slaStart: Date): OverdueHours[] {
  const out: OverdueHours[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.offerId)) continue;
    seen.add(row.offerId);
    const status = (row.status ?? "").toLowerCase();
    if (status.includes("cancel") || status.includes("draft") || isVoidedData(row.data)) continue;
    if ((isPlainSingle(row.data) ? HOURS_IN_STATUSES : TEAM_CLOSED_STATUSES).includes(status)) continue;
    const position = positionOfOffer(asObject(row.data).offerPositions, row.offerId);
    if (positionHasHours(row.data, position) || submittedSheets.has(`${row.requestId}:${row.interpreterId}`)) continue;
    // A state report arrived but is waiting for staff to match it to someone: never nag while that is open.
    const pending = asObject(row.data).pendingVerifications;
    if (Array.isArray(pending) && pending.length > 0) continue;

    let endsAt: Date;
    try {
      endsAt = new Date(resolveRequestTimes({ createdAt: row.createdAt, data: row.data }).endsAt);
    } catch {
      continue;
    }
    if (Number.isNaN(endsAt.getTime()) || endsAt < slaStart) continue;
    const dueAt = addBusinessHours(endsAt, HOURS_SLA_BUSINESS_HOURS);
    if (now < dueAt) continue;
    out.push({
      requestId: row.requestId,
      offerId: row.offerId,
      interpreterId: row.interpreterId,
      position,
      isStateJob: isStateJobRequest({ isStateJob: row.isStateJob, data: row.data }),
      endsAt: endsAt.toISOString(),
      dueAt: dueAt.toISOString(),
    });
  }
  return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** Overdue bookings now, for one interpreter (their banner) or everyone (the cron). */
export async function loadOverdueHours(opts: { interpreterId?: string; now?: Date } = {}): Promise<OverdueHours[]> {
  const now = opts.now ?? new Date();
  const conditions = [eq(offers.status, "accepted"), isNull(requests.canceledAt)];
  if (opts.interpreterId) conditions.push(eq(offers.interpreterId, opts.interpreterId));
  const rows = await db
    .select({ offerId: offers.id, requestId: offers.requestId, interpreterId: offers.interpreterId, status: requests.status, isStateJob: requests.isStateJob, createdAt: requests.createdAt, data: requests.data })
    .from(offers)
    .innerJoin(requests, eq(offers.requestId, requests.id))
    .where(and(...conditions));
  if (rows.length === 0) return [];
  const sheets = await db
    .select({ requestId: timesheets.requestId, interpreterId: timesheets.interpreterId })
    .from(timesheets)
    .where(and(inArray(timesheets.requestId, Array.from(new Set(rows.map((r) => r.requestId)))), inArray(timesheets.status, ["submitted", "approved"])));
  return findOverdue(rows, new Set(sheets.map((s) => `${s.requestId}:${s.interpreterId}`)), now, hoursSlaStart());
}
