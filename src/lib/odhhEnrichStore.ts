import { eq } from "drizzle-orm";
import { requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { db } from "@/db";
import { planEnrichment } from "@/lib/odhhEnrich";
import type { EnrichmentPlan } from "@/lib/odhhEnrich";
import { lockRequestForPosition, type DbTx } from "@/lib/positionClaim";
import { logActivity } from "@/lib/requestActivity";
import { notifyAgencyAdmins } from "@/lib/notifications";

/**
 * Applies a state request email to the job that already has its SRN: fills the blanks (see odhhEnrich.ts) under the same
 * row lock the booking actions use, so it cannot interleave with an accept or a cancel. Logs which FIELDS were filled,
 * never their values. SERVER ONLY.
 */

export interface EnrichmentResult {
  changed: string[];
  scheduleDiffers: boolean;
}

/** `exec` is the database or an open transaction (a rehearsal passes its own and rolls it back). */
export async function enrichRequestFromForm(requestId: string, form: RequestData, exec: Pick<typeof db, "transaction"> = db): Promise<{ plan: EnrichmentPlan; applied: boolean } | null> {
  const outcome = await exec.transaction(async (tx: DbTx) => {
    const locked = await lockRequestForPosition(tx, requestId);
    if (!locked) return null;
    const plan = planEnrichment({ status: locked.status, data: locked.data, startsAt: locked.createdAt }, form);
    if (plan.changed.length === 0) return { plan, applied: false };
    await tx.update(requests).set({ data: plan.data as RequestData, updatedAt: new Date() }).where(eq(requests.id, requestId));
    return { plan, applied: true };
  });
  if (!outcome) return null;

  const { plan, applied } = outcome;
  if (applied) {
    await logActivity({
      requestId,
      kind: "form_enriched",
      audience: "agency",
      message: `Filled from the state's request form: ${plan.changed.join(", ")}`,
      actorLabel: "Email intake",
    });
  }
  if (plan.scheduleDiffers) {
    await logActivity({ requestId, kind: "form_schedule_differs", audience: "agency", message: "The state's request form lists a different date or time than this job. Nothing was changed; please check it.", actorLabel: "Email intake" });
    await notifyAgencyAdmins({ type: "job", href: `/requests/${requestId}`, title: "Form time differs from the job", message: "A state request form lists a different date or time than the job on file. Open the request to check it." });
  }
  return outcome;
}
