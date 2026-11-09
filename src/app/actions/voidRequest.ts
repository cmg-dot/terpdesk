"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { afterVoid, manualVoidMessage, voidJobCore } from "@/lib/voidJob";
import { MANUAL_VOID_KINDS } from "@/lib/voidReasons";

const voidSchema = z.object({
  id: z.string().uuid(),
  // "Unable to fill" is deliberately not accepted here: it has its own action (returnUnfilledJob) with its own checks.
  kind: z.enum(MANUAL_VOID_KINDS),
  note: z.string().trim().max(300).optional(),
});

export type VoidResult = { success: true; alreadyVoided: boolean } | { success: false; error: string };

/**
 * Voids a job that should never have existed. Agency staff only. The work is in lib/voidJob.ts (shared with the state's
 * "Request Voided" email): it closes the job like a cancellation, takes billing off the table, withdraws offers and records
 * who/why/when in `data.void`. It is refused when hours were already reported for the job.
 *
 * Interpreters are told IN-APP ONLY: no email is sent, because a void is usually a wrong form or a duplicate and an email
 * would only confuse. The reason text is internal.
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
    const result = await voidJobCore(id, kind, note, session.user.id ?? null);
    switch (result.status) {
      case "not_found":
        return { success: false, error: "This job no longer exists." };
      case "cancelled":
        return { success: false, error: "This job was already cancelled, so it can't be voided." };
      case "hours_reported":
        return { success: false, error: "Hours were already reported for this job, so it can't be voided. Review or cancel it instead." };
      case "already_voided":
        return { success: true, alreadyVoided: true };
      case "booked":
      case "portal_unconfirmed":
        // Only reachable for "unable to fill", which this action does not accept.
        return { success: false, error: "We could not void this job. Nothing was changed." };
      case "voided":
        await afterVoid(id, kind, result.interpreterIds, {
          message: manualVoidMessage(kind),
          actorLabel: "Agency staff",
          userId: session.user.id,
          userEmail: session.user.email ?? null,
          auditAction: "request_voided",
        });
        return { success: true, alreadyVoided: false };
    }
  } catch (err) {
    logError("voidRequest", err);
    return { success: false, error: "We could not void this job. Nothing was changed. Please try again." };
  }
}
