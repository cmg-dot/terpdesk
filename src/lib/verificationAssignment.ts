import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { agencyInterpreters, interpreters, offers, requests, timesheets } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { interpreterDisplayName } from "@/lib/displayNameSql";
import { lockRequestForPosition, positionOfOffer } from "@/lib/positionClaim";
import { isPlainSingle, readPositions } from "@/lib/positions";
import { assignmentFields, rebuildSlots } from "@/lib/staffing";
import { recordStateJobHours } from "@/lib/stateJobHours";
import type { VerificationEffects } from "@/lib/serviceVerification";
import { signatureUrlFor } from "@/lib/verificationSignature";
import { verificationNote } from "@/lib/verificationPending";
import type { PendingVerification } from "@/lib/verificationPending";
import { removePendingVerification } from "@/lib/verificationPendingStore";

/**
 * Staff picked the interpreter for a pending service verification: books them on the job when they are not booked yet,
 * records the report's hours as a submitted timesheet (so it shows under "Awaiting review" with the state's signature),
 * and clears the pending item. ONE transaction under the request's row lock: any refusal throws, so nothing is half-done.
 *
 * The agency role is checked by the caller; this checks the interpreter is on the agency's approved roster, that they
 * hold no hours on the job yet, and that a free position exists. SERVER ONLY.
 */

export type AssignResult = { ok: true; timesheetId: string; booked: boolean } | { ok: false; error: string };
export type AssignEffects = Pick<VerificationEffects, "exec" | "audit" | "activity" | "refresh">;

class Refused extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const FINAL = new Set(["approved", "completed", "billed", "cancelled", "canceled", "awaiting_review", "correction_requested"]);
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function assignPendingVerification(
  input: { requestId: string; reportId: string; interpreterId: string; actor?: { id?: string | null; email?: string | null } },
  fx: AssignEffects,
): Promise<AssignResult> {
  const { requestId, reportId, interpreterId } = input;
  try {
    const outcome = await fx.exec.transaction(async (tx) => {
      const locked = await lockRequestForPosition(tx, requestId);
      if (!locked) throw new Refused("This job no longer exists.");
      const list = Array.isArray(locked.data.pendingVerifications) ? (locked.data.pendingVerifications as PendingVerification[]) : [];
      const pending = list.find((p) => p.id === reportId);
      if (!pending) throw new Refused("This report was already handled.");

      const [rostered] = await tx
        .select({ id: agencyInterpreters.interpreterId })
        .from(agencyInterpreters)
        .where(and(eq(agencyInterpreters.agencyId, DEFAULT_AGENCY_ID), eq(agencyInterpreters.interpreterId, interpreterId), eq(agencyInterpreters.status, "approved")))
        .limit(1);
      if (!rostered) throw new Refused("Choose someone on the agency roster.");
      const [hasHours] = await tx.select({ id: timesheets.id }).from(timesheets).where(and(eq(timesheets.requestId, requestId), eq(timesheets.interpreterId, interpreterId))).limit(1);
      if (hasHours) throw new Refused("This interpreter already has hours recorded for this job.");

      // ---- book them if they are not booked yet
      const accepted = await tx.select({ id: offers.id, interpreterId: offers.interpreterId }).from(offers).where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted")));
      let booked = false;
      if (!accepted.some((o) => o.interpreterId === interpreterId)) {
        const slots = Array.isArray(locked.data.slots) ? locked.data.slots.filter(isRecord) : [];
        const taken = new Set<number>(accepted.map((o) => positionOfOffer(locked.offerPositions, o.id)));
        for (const slot of slots) if (slot.reservedBy && typeof slot.positionIndex === "number") taken.add(slot.positionIndex);
        const ids = readPositions(locked.data).ids;
        const position = ids.find((p) => !taken.has(p));
        if (!position) throw new Refused("Every position on this job is filled by other interpreters. Choose one of them.");

        const [person] = await tx.select({ label: interpreterDisplayName }).from(interpreters).where(eq(interpreters.id, interpreterId)).limit(1);
        const label = person?.label ?? "Interpreter";
        const offerId = randomUUID();
        const expiresAt = pending.actualEnd ? new Date(pending.actualEnd) : new Date(Date.now() + THIRTY_DAYS_MS);
        await tx.insert(offers).values({ id: offerId, requestId, interpreterId, status: "accepted", expiresAt });

        const replacements = isRecord(locked.data.slotReplacements) ? (locked.data.slotReplacements as Record<string, boolean>) : {};
        const updatedSlots = rebuildSlots({ ids, existing: slots, replacements, booking: { position, offerId, interpreterId, interpreterName: label } });
        const nowStatus = String(locked.status ?? "").toLowerCase();
        const allFilled = ids.every((id) => id === position || taken.has(id));
        const status = FINAL.has(nowStatus) ? locked.status : allFilled ? "booked" : "Partially staffed";
        await tx
          .update(requests)
          .set({
            status,
            data: {
              ...locked.data,
              offerPositions: { ...locked.offerPositions, [offerId]: position },
              slotReplacements: { ...replacements, [position]: false },
              slots: updatedSlots,
              ...assignmentFields(position, interpreterId, label),
            } as never,
            updatedAt: new Date(),
          })
          .where(eq(requests.id, requestId));
        booked = true;
      }

      // ---- record the report's hours as a submitted timesheet (shows under Hours review > Awaiting review)
      const start = pending.actualStart ? new Date(pending.actualStart) : null;
      const end = pending.actualEnd ? new Date(pending.actualEnd) : null;
      const serviceHours = start && end ? Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100 : 0;
      const timesheetId = randomUUID();
      const noService = pending.serviceComplete === false || pending.cancellation !== null;
      const created = await recordStateJobHours(
        {
          requestId,
          interpreterId,
          start,
          end,
          serviceHours,
          totalMiles: pending.totalMiles,
          note: verificationNote(pending),
          review: {
            timesheetId,
            serviceCompleted: pending.serviceComplete,
            cancellationReason: noService ? [pending.cancellation, pending.comments].filter(Boolean).join(" - ") || null : null,
            signature: pending.signature ? { stored: pending.signature, url: signatureUrlFor(timesheetId) } : null,
          },
        },
        tx,
      );
      if (!created) throw new Refused("The hours could not be recorded for this interpreter.");
      await removePendingVerification(tx, requestId, reportId);
      return { timesheetId: created.id, booked };
    });

    await fx.activity({ requestId, interpreterId, audience: "shared", kind: "hours_verified", message: "Hours received from the ODHH service verification and assigned by staff (waiting for review)", actorLabel: "Agency staff" });
    await fx.audit({ action: "verification_assigned", details: `requestId=${requestId}; reportId=${reportId}; interpreterId=${interpreterId}; timesheetId=${outcome.timesheetId}; booked=${outcome.booked}; by=${input.actor?.id ?? "unknown"}` });
    fx.refresh(requestId);
    return { ok: true, timesheetId: outcome.timesheetId, booked: outcome.booked };
  } catch (err) {
    if (err instanceof Refused) return { ok: false, error: err.message };
    throw err;
  }
}
