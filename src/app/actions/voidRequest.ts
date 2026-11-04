"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { offers, requests, timesheets } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { notifyInterpreter } from "@/lib/notifications";
import { lockRequestForPosition } from "@/lib/positionClaim";
import { logActivity } from "@/lib/requestActivity";
import { VOID_KINDS, VOID_LABELS, isVoidedData, voidReasonText } from "@/lib/voidReasons";
import type { VoidRecord } from "@/lib/voidReasons";

const voidSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(VOID_KINDS),
  note: z.string().trim().max(300).optional(),
});

export type VoidResult = { success: true; alreadyVoided: boolean } | { success: false; error: string };

class Refused extends Error {}

/**
 * Voids a job that should never have existed. Agency staff only.
 *
 * It closes the job like a cancellation (status Cancelled + cancelled_at, so every screen, cron and filter that skips
 * cancelled jobs skips it; booked offers become 'cancelled', open ones 'withdrawn'), clears any service-verification
 * reports waiting on it, takes billing off the table (billing_status = cancelled_not_billable) and records who/why/when in
 * `data.void`. It is refused when hours were already reported for the job.
 *
 * Interpreters are told IN-APP ONLY: no email is sent, because a void is usually a wrong form or a duplicate and an email
 * would only confuse. One transaction under the request's row lock. The reason text is internal.
 */
export async function voidRequest(input: unknown): Promise<VoidResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: "You don't have access to this." };
  }
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Choose why this job is being voided." };
  const { id, kind } = parsed.data;
  const note = parsed.data.note ? parsed.data.note : null;

  try {
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const locked = await lockRequestForPosition(tx, id);
      if (!locked) throw new Refused("This job no longer exists.");
      if (isVoidedData(locked.data)) return { alreadyVoided: true as const, interpreterIds: [] as string[] };
      if (["cancelled", "canceled"].includes(locked.status.toLowerCase())) {
        throw new Refused("This job was already cancelled, so it can't be voided.");
      }
      const [hours] = await tx.select({ id: timesheets.id }).from(timesheets).where(eq(timesheets.requestId, id)).limit(1);
      if (hours) throw new Refused("Hours were already reported for this job, so it can't be voided. Review or cancel it instead.");

      const record: VoidRecord = { at: now.toISOString(), by: session.user.id ?? null, kind, note };
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
        .where(eq(requests.id, id));

      const live = await tx
        .select({ id: offers.id, interpreterId: offers.interpreterId, status: offers.status })
        .from(offers)
        .where(and(eq(offers.requestId, id), inArray(offers.status, ["accepted", "pending"])));
      const booked = live.filter((o) => o.status === "accepted").map((o) => o.id);
      const open = live.filter((o) => o.status === "pending").map((o) => o.id);
      if (booked.length > 0) await tx.update(offers).set({ status: "cancelled", updatedAt: now }).where(inArray(offers.id, booked));
      if (open.length > 0) await tx.update(offers).set({ status: "withdrawn", updatedAt: now }).where(inArray(offers.id, open));
      return { alreadyVoided: false as const, interpreterIds: Array.from(new Set(live.map((o) => o.interpreterId))) };
    });

    if (!result.alreadyVoided) {
      // Agency-only entry: interpreters never see why. Audit holds ids and the reason kind, never the note.
      await logActivity({ requestId: id, audience: "agency", kind: "voided", message: `Appointment voided (${VOID_LABELS[kind]})`, actorLabel: "Agency staff" });
      await writeAuditLog({ userId: session.user.id, userEmail: session.user.email ?? null, action: "request_voided", details: `requestId=${id}; kind=${kind}; interpreters=${result.interpreterIds.length}` });
      for (const interpreterId of result.interpreterIds) {
        await notifyInterpreter(interpreterId, {
          type: "job",
          href: "/jobs",
          title: "Appointment voided",
          message: "An appointment you were offered or booked on was voided by the agency and removed from your schedule.",
        });
      }
      for (const path of [`/requests/${id}`, "/requests", "/dashboard", "/calendar", "/hours-review", "/jobs", "/interpreter-home", "/interpreter-calendar"]) revalidatePath(path);
      revalidatePath("/jobs/[id]", "page");
    }
    return { success: true, alreadyVoided: result.alreadyVoided };
  } catch (err) {
    if (err instanceof Refused) return { success: false, error: err.message };
    logError("voidRequest", err);
    return { success: false, error: "We could not void this job. Nothing was changed. Please try again." };
  }
}
