"use server";

import { requireRole } from "@/lib/auth/guards";
import { z } from "zod";
import { afterCancel, cancelJobCore } from "@/lib/cancelJob";

const cancelSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(1000).optional(),
  clientRequested: z.boolean().default(false),
});

/**
 * The agency's Cancel button: cancels an appointment and closes everything attached to it (see lib/cancelJob.ts for what that is, in
 * one transaction), then tells the affected interpreters (no job details) and refreshes the agency and interpreter pages. The
 * same close-out runs when the state's cancellation notice or a confirmed requester email cancels a job, with no login.
 */
export async function cancelRequest(id: string, reason?: string, clientRequested: boolean = false) {
  await requireRole("agency");
  const parsed = cancelSchema.parse({ id, reason, clientRequested });

  const result = await cancelJobCore(parsed.id, { source: "staff", reason: parsed.reason, clientRequested: parsed.clientRequested });
  if (result.status !== "cancelled" && result.status !== "already_cancelled") return undefined;

  await afterCancel(parsed.id, result, { clientRequested: parsed.clientRequested, actorLabel: "Agency staff" });
  return result.updated;
}
