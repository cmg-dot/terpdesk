"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { hasSubmittedHours } from "@/lib/onsiteSignature";
import { logActivity } from "@/lib/requestActivity";
import { isStateJobRequest } from "@/lib/stateJob";

/** Problems are returned, not thrown: in production a thrown message is hidden from the browser. */
export type OnsiteSettingResult = { success: true; required: boolean } | { success: false; error: string };

const schema = z.object({ requestId: z.string().uuid(), required: z.boolean() });

/**
 * Switches the on-site sign-off on or off for one job, from the request page. The edit form is refused once a booked
 * appointment has started, which is exactly when staff need this, so the setting has its own action. Agency only. Refused
 * for a state job (never used) and once any hours are on the job (the setting would no longer match what was signed).
 */
export async function setOnsiteSignatureRequired(input: unknown): Promise<OnsiteSettingResult> {
  const session = await requireRole("agency");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: "That request is not valid." };
  const { requestId, required } = parsed.data;

  try {
    const outcome = await db.transaction(async (tx): Promise<OnsiteSettingResult> => {
      const [row] = await tx.select({ isStateJob: requests.isStateJob, data: requests.data }).from(requests).where(eq(requests.id, requestId)).for("update");
      if (!row) return { success: false, error: "This request no longer exists." };
      if (isStateJobRequest(row)) return { success: false, error: "State jobs report their hours in the state portal, so there is no on-site sign-off." };
      if (hasSubmittedHours(row.data)) return { success: false, error: "Hours have already been submitted for this job, so the setting can no longer change." };
      await tx.update(requests).set({ data: { ...row.data, onsiteSignatureRequired: required }, updatedAt: new Date() }).where(eq(requests.id, requestId));
      return { success: true, required };
    });
    if (!outcome.success) return outcome;

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "onsite_signature_setting_changed",
      details: `requestId=${requestId}; required=${required}`,
    });
    await logActivity({
      requestId,
      kind: "onsite_signature_setting",
      audience: "agency",
      message: required ? "On-site sign-off turned on" : "On-site sign-off turned off",
      actorLabel: session.user.name ?? "Agency staff",
    });
    revalidatePath(`/requests/${requestId}`);
    revalidatePath("/jobs");
    revalidatePath("/interpreter-home");
    return outcome;
  } catch (err) {
    logError("setOnsiteSignatureRequired", err);
    return { success: false, error: "Could not save the setting. Please try again." };
  }
}
