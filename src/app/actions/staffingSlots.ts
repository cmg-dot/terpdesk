"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { addSlotTx, removeSlotTx } from "@/lib/positionSlots";
import type { SlotOutcome } from "@/lib/positionSlots";
import { logActivity } from "@/lib/requestActivity";
import { positionIdSchema } from "@/lib/validation/position";

/** Problems are returned, not thrown: in production a thrown message is hidden from the browser. */
export type SlotActionResult = { success: true; positionId: number; count: number; ids: number[]; status: string } | { success: false; error: string };

const addSchema = z.object({ requestId: z.string().uuid() });
const removeSchema = z.object({ requestId: z.string().uuid(), positionId: positionIdSchema });

const GENERIC_ERROR = "We could not change the interpreter positions. Please try again.";

type Action = "added" | "removed";

async function finish(action: Action, requestId: string, outcome: SlotOutcome, session: { user: { id: string; email?: string | null } }): Promise<SlotActionResult> {
  if (!outcome.ok) return { success: false, error: outcome.error };
  await writeAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: `job_position_${action}`,
    details: `requestId=${requestId}; positionId=${outcome.positionId}; positions=${outcome.count}`,
  });
  await logActivity({
    requestId,
    kind: `position_${action}`,
    audience: "agency",
    message: action === "added" ? `Interpreter position added (now ${outcome.count})` : `Interpreter position removed (now ${outcome.count})`,
    actorLabel: "Agency staff",
  });
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  return { success: true, positionId: outcome.positionId, count: outcome.count, ids: outcome.ids, status: outcome.status };
}

/**
 * Adds one interpreter position to a job (up to 10), including one that is under way, for extra cover at short notice.
 * AGENCY ONLY. The job's row is locked while it is changed; the audit trail records who added it and the new count.
 */
export async function addSlot(input: unknown): Promise<SlotActionResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "That request isn't valid." };
  try {
    const outcome = await db.transaction((tx) => addSlotTx(tx, parsed.data.requestId));
    return await finish("added", parsed.data.requestId, outcome, session);
  } catch (err) {
    logError("addSlot", err);
    return { success: false, error: GENERIC_ERROR };
  }
}

/**
 * Removes an EMPTY interpreter position: refused while someone is booked in it, an offer is waiting on it, or it has hours.
 * The position's number is retired, never reused, so every other position keeps its offers, hours and history. AGENCY ONLY.
 */
export async function removeSlot(input: unknown): Promise<SlotActionResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "That request isn't valid." };
  try {
    const outcome = await db.transaction((tx) => removeSlotTx(tx, parsed.data.requestId, parsed.data.positionId));
    return await finish("removed", parsed.data.requestId, outcome, session);
  } catch (err) {
    logError("removeSlot", err);
    return { success: false, error: GENERIC_ERROR };
  }
}
