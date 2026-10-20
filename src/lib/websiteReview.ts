import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { agencyInterpreters } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { notifyAgencyAdmins } from "@/lib/notifications";

/**
 * Anything an agency website would show (name, photo, bio, service area) changed after the agency approved it, so
 * the agency must review it again. Moves every APPROVED website permission for this interpreter back to 'pending'
 * and returns how many were moved. Pass a transaction to keep it atomic with the change that caused it.
 *
 * SERVER ONLY: writes to the database.
 */
export async function sendApprovedWebsiteProfilesBackToReview(
  executor: Pick<typeof db, "update">,
  interpreterId: string,
): Promise<number> {
  const rows = await executor
    .update(agencyInterpreters)
    .set({ websitePermissionStatus: "pending", updatedAt: new Date() })
    .where(and(eq(agencyInterpreters.interpreterId, interpreterId), eq(agencyInterpreters.websitePermissionStatus, "approved")))
    .returning({ id: agencyInterpreters.id });
  return rows.length;
}

/** Audit entry + agency notification after profiles were moved back to review. */
export async function announceWebsiteReReview(params: {
  userId: string;
  userEmail: string | null;
  interpreterId: string;
  displayName: string;
  agencies: number;
}): Promise<void> {
  await writeAuditLog({
    userId: params.userId,
    userEmail: params.userEmail,
    action: "website_profile_re_review",
    details: `interpreterId=${params.interpreterId}; agencies=${params.agencies}`,
  });
  await notifyAgencyAdmins({
    type: "agency",
    href: "/interpreters?tab=website",
    title: "Website profile needs review",
    message: `${params.displayName || "An interpreter"} changed their public profile. It is back in your review queue.`,
  });
  revalidatePath("/interpreters");
}
