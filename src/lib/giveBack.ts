import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { notifyAgencyAdmins } from "@/lib/notifications";
import { lockRequestForPosition, positionOfOffer } from "@/lib/positionClaim";
import { logActivity } from "@/lib/requestActivity";
import { formatReference } from "@/utils/statusEngine";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * "Give back assignment", shared by the app and the secure job-details link.
 *
 * Positional isolation: only the giver's own accepted offer changes, and only ITS position is released (slot,
 * assigned-name fields, replacement flag). The other position of a team job, its interpreter, offers and hours are
 * never touched. Allowed only before the appointment starts.
 *
 * SERVER ONLY.
 */

export type GiveBackResult = { success: true } | { success: false; error: string };

const MAX_REASON = 1000;

export async function giveBackBooking(params: {
  offerId: string;
  interpreterId: string;
  reason: string;
  via: "app" | "secure link";
}): Promise<GiveBackResult> {
  const reason = params.reason.replace(/\r\n/g, "\n").trim().slice(0, MAX_REASON);
  const now = new Date();

  const outcome = await db.transaction(async (tx): Promise<{ ok: true; requestId: string; position: 1 | 2 } | { ok: false; error: string }> => {
    const [offer] = await tx
      .select({ requestId: offers.requestId })
      .from(offers)
      .where(and(eq(offers.id, params.offerId), eq(offers.interpreterId, params.interpreterId)))
      .limit(1);
    if (!offer) return { ok: false, error: "This booking could not be found." };

    const locked = await lockRequestForPosition(tx, offer.requestId);
    if (!locked) return { ok: false, error: "This job no longer exists." };

    try {
      const start = new Date(resolveRequestTimes({ createdAt: locked.createdAt, data: locked.data }).startsAt).getTime();
      if (!Number.isNaN(start) && now.getTime() >= start) {
        return { ok: false, error: "Assignments can't be given back once the appointment has started. Please contact the agency." };
      }
    } catch {
      // Unknown time: allow, the agency is notified either way.
    }

    // Only the giver's own, still-accepted offer.
    const [returned] = await tx
      .update(offers)
      .set({ status: "returned", updatedAt: now })
      .where(and(eq(offers.id, params.offerId), eq(offers.interpreterId, params.interpreterId), eq(offers.status, "accepted")))
      .returning({ id: offers.id });
    if (!returned) return { ok: false, error: "You're no longer booked on this job, so there is nothing to give back." };

    const position = positionOfOffer(locked.offerPositions, params.offerId);
    const data = locked.data as Record<string, any>;
    const slots = Array.isArray(data.slots)
      ? data.slots.map((s: { positionIndex?: number; reservedBy?: string | null }) =>
          // Only the giver's own (or an empty) slot is released.
          s.positionIndex === position && (!s.reservedBy || s.reservedBy === params.interpreterId)
            ? { ...s, reservedBy: null, assignedInterpreterId: null, interpreterName: undefined, needsReplacement: true }
            : s,
        )
      : data.slots;
    const ownId = position === 1 ? data.assignedInterpreterId : data.position2InterpreterId;
    const cleared =
      ownId && ownId !== params.interpreterId
        ? {}
        : position === 1
          ? { assignedInterpreterId: null, assignedInterpreterName: null }
          : { position2InterpreterId: null, position2InterpreterName: null };
    const status = "Needs replacement";

    await tx
      .update(requests)
      .set({
        status,
        data: {
          ...data,
          ...cleared,
          slots,
          slotReplacements: { ...(data.slotReplacements || {}), [position]: true },
          ...(data.overview ? { overview: { ...data.overview, status } } : {}),
          // existingData is a loose record, so the spread loses the typed `brief` / `intake` keys.
        } as unknown as RequestData,
        updatedAt: now,
      })
      .where(eq(requests.id, offer.requestId));
    return { ok: true, requestId: offer.requestId, position };
  });

  if (!outcome.ok) return { success: false, error: outcome.error };

  const name = (await getInterpreterDisplayName(params.interpreterId).catch(() => null)) || "An interpreter";
  await notifyAgencyAdmins({
    type: "job",
    href: `/requests/${outcome.requestId}`,
    title: "Assignment given back",
    message: `${name} gave back Position ${outcome.position} of booking ${formatReference(outcome.requestId)}. It needs a replacement.`,
  });
  // The reason can be personal, so it stays in the staff-only log (never in a notification or email).
  await logActivity({
    requestId: outcome.requestId,
    interpreterId: params.interpreterId,
    kind: "given_back",
    message: `Assignment given back (Position ${outcome.position})${reason ? `. Reason: ${reason}` : ""}`,
    actorLabel: `Interpreter (${params.via})`,
  });
  return { success: true };
}
