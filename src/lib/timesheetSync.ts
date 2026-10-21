import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { offers, requests, timesheets } from "@/db/schema";
import type { RequestData, SelectTimesheet, TimesheetTravelLeg } from "@/db/schema";
import { legacyPosition1Hours } from "@/utils/hoursState";

/**
 * Keeps magic-link timesheets and in-app hours on ONE source of truth.
 *
 * The interpreter app (jobs list, job page, home) reads `requests.data.hoursSubmissions[position]`. A secure-link
 * submission lands in the `timesheets` table, so it is mirrored into that same slot here. The mirror carries the
 * `timesheetId`, which the agency review panel uses to show the timesheet once instead of twice.
 */

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type JsonObject = Record<string, unknown>;

/** The timesheet columns needed to build the in-app hours record (the signature stays on the timesheet row). */
export type TimesheetForSync = Pick<
  SelectTimesheet,
  | "id"
  | "status"
  | "actualStartTime"
  | "actualEndTime"
  | "breakMinutes"
  | "travelStartTime"
  | "travelEndTime"
  | "mileage"
  | "approvedMileage"
  | "travelLegs"
  | "mileageNote"
  | "serviceNote"
  | "serviceCompleted"
  | "cancellationReason"
  | "submittedAt"
>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const num = (v: string | null): number | null => (v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const asObject = (v: unknown): JsonObject => (v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : {});
/** The stored request data; the column always holds `brief` and `intake`, defaulted here for legacy rows. */
const requestData = (v: unknown): RequestData => ({ brief: {}, intake: {}, ...asObject(v) });

/** The same shape `submitInterpreterHours` writes, built from a magic-link timesheet. */
export function timesheetToHoursSubmission(ts: TimesheetForSync, positionIndex: 1 | 2): JsonObject {
  const approved = ts.status === "approved";
  return {
    positionIndex,
    actualStartTime: iso(ts.actualStartTime),
    actualEndTime: iso(ts.actualEndTime),
    miles: num(ts.mileage) ?? 0,
    legs: (ts.travelLegs ?? []) as TimesheetTravelLeg[],
    breakMinutes: ts.breakMinutes ?? 0,
    travelStartTime: iso(ts.travelStartTime),
    travelEndTime: iso(ts.travelEndTime),
    serviceCompleted: ts.serviceCompleted,
    mileageNote: ts.mileageNote ?? "",
    note: ts.serviceNote ?? "",
    cancellationReason: ts.cancellationReason,
    version: 1,
    // Kept only on the timesheet row so the (large) image is not duplicated into every request read.
    signatureDataUrl: null,
    submittedAt: iso(ts.submittedAt),
    reviewMessage: null,
    approvedMileage: approved ? num(ts.approvedMileage) : null,
    status: approved ? "approved" : "awaiting_review",
    timesheetId: ts.id,
    source: "magic_link",
  };
}

/** The position (1 or 2) the interpreter holds on the request, or null if they never had an offer for it. */
async function positionFor(tx: DbTx, requestId: string, interpreterId: string, data: JsonObject): Promise<1 | 2 | null> {
  const rows = await tx
    .select({ id: offers.id, status: offers.status })
    .from(offers)
    .where(and(eq(offers.requestId, requestId), eq(offers.interpreterId, interpreterId)))
    .orderBy(desc(offers.updatedAt));
  const offer = rows.find((o) => o.status === "accepted") ?? rows[0];
  if (!offer) return null;
  return asObject(data.offerPositions)[offer.id] === 2 ? 2 : 1;
}

const FINAL_REQUEST_STATUSES = new Set(["approved", "completed", "billed", "cancelled", "canceled"]);

/**
 * Writes a just-submitted magic-link timesheet into `requests.data.hoursSubmissions` and moves the request to
 * 'awaiting_review', exactly like an in-app submission. Run inside the submitting transaction.
 */
export async function mirrorTimesheetSubmission(tx: DbTx, requestId: string, interpreterId: string, ts: TimesheetForSync): Promise<void> {
  const [req] = await tx
    .select({ status: requests.status, data: requests.data })
    .from(requests)
    .where(eq(requests.id, requestId))
    .for("update");
  if (!req) return;
  const data = requestData(req.data);
  const pos = await positionFor(tx, requestId, interpreterId, data);
  if (!pos) return;

  const all = asObject(data.hoursSubmissions);
  const existing = asObject(all[pos] ?? (pos === 1 ? legacyPosition1Hours(data) : null));
  // Never overwrite another interpreter's hours for this position.
  if (typeof existing.interpreterId === "string" && existing.interpreterId !== interpreterId) return;

  const history = Array.isArray(existing.history) ? existing.history : [];
  const submission = {
    ...existing,
    ...timesheetToHoursSubmission(ts, pos),
    interpreterId,
    history: [
      ...history,
      {
        id: ts.id,
        type: "initial_submission",
        title: "Hours submitted via secure link",
        actor: `Interpreter (Position ${pos})`,
        timestamp: iso(ts.submittedAt) ?? new Date().toISOString(),
        version: 1,
        details: { actualStart: iso(ts.actualStartTime), actualEnd: iso(ts.actualEndTime), mileage: num(ts.mileage) ?? 0, positionIndex: pos },
      },
    ],
  };

  const status = String(req.status ?? "").toLowerCase();
  await tx
    .update(requests)
    .set({
      ...(FINAL_REQUEST_STATUSES.has(status) ? {} : { status: "awaiting_review" }),
      // Request-level columns are a Position 1 legacy field; Position 2's values live only in its own slot.
      ...(pos === 1 && ts.travelStartTime ? { travelStartTime: ts.travelStartTime, travelEndTime: ts.travelEndTime } : {}),
      ...(pos === 1 && ts.serviceCompleted !== null ? { serviceCompleted: ts.serviceCompleted } : {}),
      data: {
        ...data,
        hoursSubmissions: { ...all, [pos]: submission },
        // Legacy single-position field: Position 1 only, so Position 2 can never leak into it.
        ...(pos === 1 ? { hoursSubmission: submission } : {}),
      },
      updatedAt: new Date(),
    })
    .where(eq(requests.id, requestId));
}

/** Marks the mirrored hours record approved when the agency approves its timesheet. No-op for unmirrored rows. */
export async function mirrorTimesheetApproval(tx: DbTx, requestId: string, timesheetId: string, approvedMileage: number): Promise<void> {
  const [req] = await tx.select({ data: requests.data }).from(requests).where(eq(requests.id, requestId)).for("update");
  if (!req) return;
  const data = requestData(req.data);
  const all = asObject(data.hoursSubmissions);
  const pos = ([1, 2] as const).find((p) => asObject(all[p]).timesheetId === timesheetId);
  if (!pos) return;

  const current = asObject(all[pos]);
  const history = Array.isArray(current.history) ? current.history : [];
  const approved = {
    ...current,
    status: "approved",
    approvedMileage,
    reviewMessage: null,
    history: [
      ...history,
      {
        id: `${timesheetId}-approved`,
        type: "approved",
        title: `Hours approved and finalized (Position ${pos})`,
        actor: "Agency Staff",
        timestamp: new Date().toISOString(),
        version: Number(current.version ?? 1),
        details: { approvedMileage },
      },
    ],
  };
  await tx
    .update(requests)
    .set({
      data: { ...data, hoursSubmissions: { ...all, [pos]: approved }, ...(pos === 1 ? { hoursSubmission: approved } : {}) },
      updatedAt: new Date(),
    })
    .where(eq(requests.id, requestId));
}

/**
 * Team jobs: true only when EVERY currently booked position has approved hours (in-app or secure-link), so approving
 * Position 1 never marks the whole request completed while Position 2 is still waiting.
 */
export async function allBookedPositionsApproved(tx: DbTx, requestId: string): Promise<boolean> {
  const [req] = await tx.select({ data: requests.data }).from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!req) return false;
  const data = requestData(req.data);
  const positions = asObject(data.offerPositions);
  const hours = asObject(data.hoursSubmissions);
  const booked = await tx
    .select({ id: offers.id, interpreterId: offers.interpreterId })
    .from(offers)
    .where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted")));
  if (booked.length === 0) return true;
  const approvedSheets = await tx
    .select({ interpreterId: timesheets.interpreterId })
    .from(timesheets)
    .where(and(eq(timesheets.requestId, requestId), eq(timesheets.status, "approved")));
  const approvedBySheet = new Set(approvedSheets.map((t) => t.interpreterId));
  return booked.every((b) => {
    const pos = positions[b.id] === 2 ? 2 : 1;
    return asObject(hours[pos]).status === "approved" || approvedBySheet.has(b.interpreterId);
  });
}
