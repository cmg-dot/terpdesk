"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { afterVoid, manualVoidMessage, voidJobCore } from "@/lib/voidJob";
import { RETURNED_KIND } from "@/lib/voidReasons";

const returnSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(300).optional(),
  /** The "Returned in ODHH portal" box. Required by the core for a state job. */
  returnedInPortal: z.boolean().default(false),
});

export type ReturnUnfilledResult = { success: true; alreadyClosed: boolean } | { success: false; error: string };

/**
 * "Unable to fill": the agency could not staff this job and has returned it to the state or the requester. Agency staff only.
 * The job is closed like a cancellation (it leaves the dashboard, Needs attention and every coverage count), billing is cleared
 * (nothing was worked), open offers are withdrawn, and the record is kept in `data.void` with its own kind so it shows under
 * its own "Returned" badge and filter, not as a void or a client cancellation. Refused when anyone is booked (cancel it
 * instead), when hours were already reported, and, for a state job, unless the "returned in the state's portal" box was ticked.
 *
 * Interpreters with an open offer are told in the app only; no email is sent. The note is internal and never logged.
 */
export async function returnUnfilledJob(input: unknown): Promise<ReturnUnfilledResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: "You don't have access to this." };
  }
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "That could not be read. Please try again." };
  const { id, returnedInPortal } = parsed.data;
  const note = parsed.data.note ? parsed.data.note : null;

  try {
    const result = await voidJobCore(id, RETURNED_KIND, note, session.user.id ?? null, undefined, { portalReturned: returnedInPortal });
    switch (result.status) {
      case "not_found":
        return { success: false, error: "This job no longer exists." };
      case "cancelled":
        return { success: false, error: "This job was already cancelled, so it can't be marked unable to fill." };
      case "booked":
        return { success: false, error: "An interpreter is booked on this job. Remove the booking or cancel the appointment instead." };
      case "portal_unconfirmed":
        return { success: false, error: "Confirm that you returned this job in the ODHH portal first." };
      case "hours_reported":
        return { success: false, error: "Hours were already reported for this job, so it can't be returned. Review or cancel it instead." };
      case "already_voided":
        return { success: true, alreadyClosed: true };
      case "voided":
        await afterVoid(id, RETURNED_KIND, result.interpreterIds, {
          message: manualVoidMessage(RETURNED_KIND),
          actorLabel: "Agency staff",
          userId: session.user.id,
          userEmail: session.user.email ?? null,
          auditAction: "request_returned_unfilled",
          auditExtra: `portalReturned=${returnedInPortal ? "yes" : "no"}`,
        });
        return { success: true, alreadyClosed: false };
    }
  } catch (err) {
    logError("returnUnfilledJob", err);
    return { success: false, error: "We could not close this job. Nothing was changed. Please try again." };
  }
}
