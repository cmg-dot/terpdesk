"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { writePriorAuth } from "@/lib/priorAuthStore";
import { logActivity } from "@/lib/requestActivity";
import { PRIOR_AUTH_FORMAT_MESSAGE, setPriorAuthSchema } from "@/lib/validation/priorAuth";

/** Problems are returned, not thrown: in production a thrown message is hidden from the browser. */
export type SetPriorAuthResult = { success: true; priorAuth: string } | { success: false; error: string };

/**
 * Saves the prior-authorization number on a job (intake.priorAuthNumber) straight from the Staffing box, so a dispatcher does
 * not have to open Edit assignment (which is locked while an offer is out or an interpreter is booked) to record it.
 * AGENCY ONLY, in both directions: only agency staff can write it, and it is never sent to interpreters (their views are built
 * from an allowlist that does not include it) or put in an email. Only that one key changes; nothing else on the job is touched.
 * The AUDIT row records only that it was added, changed or cleared. The activity line is agency-only (an interpreter never sees it) and says
 * what the number is now, so a dispatcher can see what changed without opening the job.
 */
export async function setPriorAuth(input: unknown): Promise<SetPriorAuthResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }

  const parsed = setPriorAuthSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: PRIOR_AUTH_FORMAT_MESSAGE };
  const { requestId, priorAuth } = parsed.data;

  let hadValue = false;
  let unchanged = false;
  try {
    const written = await writePriorAuth(requestId, priorAuth);
    if (!written.ok) return { success: false, error: "This request no longer exists." };
    hadValue = written.hadValue;
    unchanged = written.previous === priorAuth;
  } catch (err) {
    logError("setPriorAuth", err);
    return { success: false, error: "We could not save the prior authorization number. Please try again." };
  }

  // Saving the number that is already there changes nothing, so it writes nothing.
  if (unchanged) return { success: true, priorAuth };
  const what = priorAuth === "" ? "cleared" : hadValue ? "changed" : "added";
  await writeAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: "prior_auth_saved",
    details: `requestId=${requestId}; ${what}; length=${priorAuth.length}`,
  });
  await logActivity({ requestId, kind: "prior_auth", audience: "agency", message: priorAuth === "" ? "Prior authorization number removed" : hadValue ? `Prior authorization number updated to '${priorAuth}'` : `Prior authorization number set to '${priorAuth}'`, actorLabel: "Agency staff" });
  revalidatePath(`/requests/${requestId}`);
  return { success: true, priorAuth };
}
