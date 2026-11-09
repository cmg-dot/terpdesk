import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { offers, requests, timesheets } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { notifyInterpreter } from "@/lib/notifications";
import { lockRequestForPosition } from "@/lib/positionClaim";
import type { DbTx } from "@/lib/positionClaim";
import { logActivity } from "@/lib/requestActivity";
import { isStateJobRequest } from "@/lib/stateJob";
import { RETURNED_KIND, VOID_LABELS, isVoidedData, voidReasonText } from "@/lib/voidReasons";
import type { VoidKind, VoidRecord } from "@/lib/voidReasons";

/**
 * Voiding a job, in one place: the agency's "Void job" button (actions/voidRequest.ts) and the state's "Request Voided" email
 * (stateVoidNotice.ts) both end here, so a voided job looks the same whichever way it was voided.
 *
 * It closes the job like a cancellation (status Cancelled + cancelled_at, so every screen, cron and filter that skips
 * cancelled jobs skips it; booked offers become 'cancelled', open ones 'withdrawn'), clears any service-verification reports
 * waiting on it, takes billing off the table (billing_status = cancelled_not_billable, the app's "not billable" value) and
 * records who, why and when in `data.void`. It is refused when hours were already reported. One transaction under the
 * request's row lock. SERVER ONLY.
 *
 * "Unable to fill" (kind unable_to_fill, from actions/returnUnfilledJob.ts) goes through the same close-out, with two extra
 * refusals enforced HERE (not just in the button): nobody may be booked (a booked job is cancelled, not returned), and a state
 * job needs the "returned in the state's portal" confirmation.
 */

export type VoidCoreResult =
  | { status: "voided"; interpreterIds: string[] }
  | { status: "already_voided" }
  | { status: "not_found" }
  | { status: "cancelled" }
  | { status: "hours_reported" }
  | { status: "booked" }
  | { status: "portal_unconfirmed" };

type Executor = Pick<typeof db, "transaction">;

export interface VoidOptions {
  /** "Unable to fill" only: staff confirmed the job was also returned in the state's portal. */
  portalReturned?: boolean;
}

export async function voidJobCore(requestId: string, kind: VoidKind, note: string | null, by: string | null, exec: Executor = db, opts: VoidOptions = {}): Promise<VoidCoreResult> {
  const now = new Date();
  return exec.transaction(async (tx: DbTx): Promise<VoidCoreResult> => {
    const locked = await lockRequestForPosition(tx, requestId);
    if (!locked) return { status: "not_found" };
    if (isVoidedData(locked.data)) return { status: "already_voided" };
    if (["cancelled", "canceled"].includes(locked.status.toLowerCase())) return { status: "cancelled" };
    const returned = kind === RETURNED_KIND;
    if (returned) {
      const [booking] = await tx.select({ id: offers.id }).from(offers).where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted"))).limit(1);
      if (booking) return { status: "booked" };
      const [row] = await tx.select({ isStateJob: requests.isStateJob }).from(requests).where(eq(requests.id, requestId)).limit(1);
      if (isStateJobRequest({ isStateJob: row?.isStateJob, data: locked.data }) && opts.portalReturned !== true) return { status: "portal_unconfirmed" };
    }
    const [hours] = await tx.select({ id: timesheets.id }).from(timesheets).where(eq(timesheets.requestId, requestId)).limit(1);
    if (hours) return { status: "hours_reported" };

    const record: VoidRecord = { at: now.toISOString(), by, kind, note, ...(returned ? { portalReturned: opts.portalReturned === true } : {}) };
    const { pendingVerifications: _cleared, ...rest } = locked.data as Record<string, unknown>;
    void _cleared;
    await tx
      .update(requests)
      .set({
        status: "Cancelled",
        canceledAt: now,
        cancelReason: voidReasonText(kind, note),
        clientRequestedCancellation: false,
        billingStatus: "cancelled_not_billable",
        data: { ...rest, void: record } as never,
        updatedAt: now,
      })
      .where(eq(requests.id, requestId));

    const live = await tx
      .select({ id: offers.id, interpreterId: offers.interpreterId, status: offers.status })
      .from(offers)
      .where(and(eq(offers.requestId, requestId), inArray(offers.status, ["accepted", "pending"])));
    const booked = live.filter((o) => o.status === "accepted").map((o) => o.id);
    const open = live.filter((o) => o.status === "pending").map((o) => o.id);
    if (booked.length > 0) await tx.update(offers).set({ status: "cancelled", updatedAt: now }).where(inArray(offers.id, booked));
    if (open.length > 0) await tx.update(offers).set({ status: "withdrawn", updatedAt: now }).where(inArray(offers.id, open));
    return { status: "voided", interpreterIds: Array.from(new Set(live.map((o) => o.interpreterId))) };
  });
}

export interface VoidAftermath {
  /** The agency-only activity line. */
  message: string;
  actorLabel: string;
  /** The audit trail's user (null when the system did it). */
  userId: string | null;
  userEmail: string | null;
  /** "request_voided", "request_voided_auto" or "request_returned_unfilled". */
  auditAction: string;
  /** Appended to the audit line (fixed labels only, never free text). */
  auditExtra?: string;
}

/**
 * What follows a void: the agency-only activity entry, the audit line (ids and the reason kind, never a note), an in-app notice
 * to each interpreter who was offered or booked (no email: a void is usually a wrong form or a duplicate), and fresh pages.
 */
export async function afterVoid(requestId: string, kind: VoidKind, interpreterIds: string[], after: VoidAftermath): Promise<void> {
  const returned = kind === RETURNED_KIND;
  await logActivity({ requestId, audience: "agency", kind: returned ? "returned_unfilled" : "voided", message: after.message, actorLabel: after.actorLabel });
  await writeAuditLog({ userId: after.userId, userEmail: after.userEmail, action: after.auditAction, details: `requestId=${requestId}; kind=${kind}; interpreters=${interpreterIds.length}${after.auditExtra ? `; ${after.auditExtra}` : ""}` });
  for (const interpreterId of interpreterIds) {
    await notifyInterpreter(interpreterId, returned
      ? { type: "job", href: "/jobs", title: "Appointment closed", message: "An appointment you were offered was closed by the agency because it could not be filled." }
      : { type: "job", href: "/jobs", title: "Appointment voided", message: "An appointment you were offered or booked on was voided by the agency and removed from your schedule." });
  }
  for (const path of [`/requests/${requestId}`, "/requests", "/dashboard", "/calendar", "/hours-review", "/jobs", "/interpreter-home", "/interpreter-calendar"]) revalidatePath(path);
  revalidatePath("/jobs/[id]", "page");
}

export const manualVoidMessage = (kind: VoidKind): string => (kind === RETURNED_KIND ? "Marked unable to fill and returned to the state" : `Appointment voided (${VOID_LABELS[kind]})`);
