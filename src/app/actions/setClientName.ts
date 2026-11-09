"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { logActivity } from "@/lib/requestActivity";
import { CLIENT_NAME_MAX, setClientNameSchema } from "@/lib/validation/clientName";

/** Problems are returned, not thrown: in production a thrown message is hidden from the browser. */
export type SetClientNameResult = { success: true; clientName: string } | { success: false; error: string };

/**
 * Saves the client's name on a job (details.deafParticipant: shared with an interpreter only once they are booked, never on an unaccepted offer and never in an email)
 * straight from the Staffing box, so a dispatcher can add it while an offer is out or an interpreter is booked, when the edit
 * flow is locked. Only that one field changes; nothing else on the job is touched. Agency staff only. The name itself is
 * never written to a log: the audit and activity entries record only that it was set, changed or cleared.
 */
export async function setClientName(input: unknown): Promise<SetClientNameResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }

  const parsed = setClientNameSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: `Enter a client name of ${CLIENT_NAME_MAX} characters or fewer.` };
  const { requestId, clientName } = parsed.data;

  let hadName = false;
  try {
    const [existing] = await db.select({ data: requests.data }).from(requests).where(eq(requests.id, requestId)).limit(1);
    if (!existing) return { success: false, error: "This request no longer exists." };
    hadName = typeof existing.data?.details?.deafParticipant === "string" && existing.data.details.deafParticipant.trim() !== "";
    await db
      .update(requests)
      .set({
        data: sql<RequestData>`jsonb_set(${requests.data}, '{details}', coalesce(${requests.data} -> 'details', '{}'::jsonb) || jsonb_build_object('deafParticipant', ${clientName}::text), true)`,
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));
  } catch (err) {
    logError("setClientName", err);
    return { success: false, error: "We could not save the client name. Please try again." };
  }

  const what = clientName === "" ? "cleared" : hadName ? "changed" : "added";
  await writeAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: "client_name_saved",
    details: `requestId=${requestId}; ${what}; length=${clientName.length}`,
  });
  await logActivity({ requestId, kind: "client_name", audience: "agency", message: `Client name ${what}`, actorLabel: "Agency staff" });
  revalidatePath(`/requests/${requestId}`);
  return { success: true, clientName };
}
