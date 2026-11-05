import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { offers, requests, timesheets } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { notifyInterpreter } from "@/lib/notifications";
import { lockRequestForPosition } from "@/lib/positionClaim";
import type { DbTx } from "@/lib/positionClaim";
import { logActivity } from "@/lib/requestActivity";
import { VOID_LABELS, isVoidedData, voidReasonText } from "@/lib/voidReasons";
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
 */

export type VoidCoreResult =
  | { status: "voided"; interpreterIds: string[] }
  | { status: "already_voided" }
  | { status: "not_found" }
  | { status: "cancelled" }
  | { status: "hours_reported" };

type Executor = Pick<typeof db, "transaction">;

export async function voidJobCore(requestId: string, kind: VoidKind, note: string | null, by: string | null, exec: Executor = db): Promise<VoidCoreResult> {
  const now = new Date();
  return exec.transaction(async (tx: DbTx): Promise<VoidCoreResult> => {
    const locked = await lockRequestForPosition(tx, requestId);
    if (!locked) return { status: "not_found" };
    if (isVoidedData(locked.data)) return { status: "already_voided" };
    if (["cancelled", "canceled"].includes(locked.status.toLowerCase())) return { status: "cancelled" };
    const [hours] = await tx.select({ id: timesheets.id }).from(timesheets).where(eq(timesheets.requestId, requestId)).limit(1);
    if (hours) return { status: "hours_reported" };

    const record: VoidRecord = { at: now.toISOString(), by, kind, note };
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
  /** "request_voided" or "request_voided_auto". */
  auditAction: string;
}

/**
 * What follows a void: the agency-only activity entry, the audit line (ids and the reason kind, never a note), an in-app notice
 * to each interpreter who was offered or booked (no email: a void is usually a wrong form or a duplicate), and fresh pages.
 */
export async function afterVoid(requestId: string, kind: VoidKind, interpreterIds: string[], after: VoidAftermath): Promise<void> {
  await logActivity({ requestId, audience: "agency", kind: "voided", message: after.message, actorLabel: after.actorLabel });
  await writeAuditLog({ userId: after.userId, userEmail: after.userEmail, action: after.auditAction, details: `requestId=${requestId}; kind=${kind}; interpreters=${interpreterIds.length}` });
  for (const interpreterId of interpreterIds) {
    await notifyInterpreter(interpreterId, {
      type: "job",
      href: "/jobs",
      title: "Appointment voided",
      message: "An appointment you were offered or booked on was voided by the agency and removed from your schedule.",
    });
  }
  for (const path of [`/requests/${requestId}`, "/requests", "/dashboard", "/calendar", "/hours-review", "/jobs", "/interpreter-home", "/interpreter-calendar"]) revalidatePath(path);
  revalidatePath("/jobs/[id]", "page");
}

export const manualVoidMessage = (kind: VoidKind): string => `Appointment voided (${VOID_LABELS[kind]})`;
