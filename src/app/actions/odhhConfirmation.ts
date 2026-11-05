"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { lockRequestForPosition } from "@/lib/positionClaim";
import type { DbTx } from "@/lib/positionClaim";
import { logActivity } from "@/lib/requestActivity";
import { isStateJobRequest } from "@/lib/stateJob";

const inputSchema = z.object({ requestId: z.string().uuid(), confirmed: z.boolean() });

export type OdhhConfirmationResult =
  | { success: true; confirmed: boolean; confirmedAt: string | null }
  | { success: false; error: string };

const FAILED = "We could not save that. Please try again.";

/**
 * Staff mark a state job's booking as confirmed on the ODHH portal (or undo it). The portal is outside terpDESK, so this is
 * only a record that someone did it by hand: `intake.odhhConfirmed` (and when) on the job. Agency staff only; only a state job
 * can carry it. Nothing but those two fields changes, under the same row lock the booking actions use.
 */
export async function setOdhhConfirmed(input: { requestId: string; confirmed: boolean }): Promise<OdhhConfirmationResult> {
  let staffName = "Agency staff";
  try {
    const session = await requireRole("agency");
    staffName = session.user.name ?? staffName;
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "That job could not be found." };
  const { requestId, confirmed } = parsed.data;

  try {
    const result = await db.transaction(async (tx: DbTx) => {
      const locked = await lockRequestForPosition(tx, requestId);
      if (!locked) return { ok: false, error: "That job could not be found." } as const;
      if (!isStateJobRequest({ isStateJob: undefined, data: locked.data })) return { ok: false, error: "Only a state job is confirmed on the ODHH portal." } as const;
      const intake = (locked.data.intake && typeof locked.data.intake === "object" ? locked.data.intake : {}) as Record<string, unknown>;
      const { odhhConfirmedAt: _previous, ...rest } = intake;
      void _previous;
      const confirmedAt = confirmed ? new Date().toISOString() : null;
      const next = { ...locked.data, intake: { ...rest, odhhConfirmed: confirmed, ...(confirmedAt ? { odhhConfirmedAt: confirmedAt } : {}) } } as unknown as RequestData;
      await tx.update(requests).set({ data: next, updatedAt: new Date() }).where(eq(requests.id, requestId));
      return { ok: true, confirmedAt } as const;
    });
    if (!result.ok) return { success: false, error: result.error };
    await logActivity({
      requestId,
      kind: confirmed ? "odhh_confirmed" : "odhh_unconfirmed",
      audience: "agency",
      message: confirmed ? "Marked as confirmed on the ODHH portal." : "Undid the ODHH portal confirmation.",
      actorLabel: staffName,
    });
    revalidatePath(`/requests/${requestId}`);
    return { success: true, confirmed, confirmedAt: result.confirmedAt };
  } catch (error) {
    logError("setOdhhConfirmed", error);
    return { success: false, error: FAILED };
  }
}
