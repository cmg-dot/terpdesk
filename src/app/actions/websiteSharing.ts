"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agencyInterpreters } from "@/db/schema";
import { ensureAgencyInterpreterColumns } from "@/lib/agencyInterpreterColumns";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { notifyAgencyAdmins } from "@/lib/notifications";
import type { MyWebsiteSharing, WebsitePermission } from "@/lib/websiteProfile";

export type SetWebsiteSharingResult = { success: true; status: WebsitePermission } | { success: false; error: string };

const setSchema = z.object({ agencyId: z.string().trim().min(1).max(100), allow: z.boolean() });

/** The signed-in interpreter's website permission for each agency they are connected to. */
export async function getMyWebsiteSharing(): Promise<MyWebsiteSharing[]> {
  const { interpreterId } = await requireInterpreter();
  await ensureAgencyInterpreterColumns();
  const rows = await db
    .select({ agencyId: agencyInterpreters.agencyId, status: agencyInterpreters.websitePermissionStatus })
    .from(agencyInterpreters)
    .where(and(eq(agencyInterpreters.interpreterId, interpreterId), eq(agencyInterpreters.status, "approved")));
  return rows;
}

/**
 * Opt in or out of an agency featuring the interpreter's public profile on its website.
 * Opting in asks the agency (status 'pending'); an existing approval is kept. Opting out always clears it.
 */
export async function setWebsiteSharing(input: z.input<typeof setSchema>): Promise<SetWebsiteSharingResult> {
  let session;
  let interpreterId: string;
  try {
    ({ session, interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: "Connect your interpreter profile before changing website sharing." };
  }

  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { agencyId, allow } = parsed.data;

  try {
    await ensureAgencyInterpreterColumns();
    // Only an agency the interpreter is connected to (approved roster row) can be given permission.
    const thisConnection = and(
      eq(agencyInterpreters.interpreterId, interpreterId),
      eq(agencyInterpreters.agencyId, agencyId),
      eq(agencyInterpreters.status, "approved"),
    );
    const [current] = await db
      .select({ status: agencyInterpreters.websitePermissionStatus })
      .from(agencyInterpreters)
      .where(thisConnection)
      .limit(1);
    if (!current) return { success: false, error: "You can only share with agencies you are connected to." };

    const next: WebsitePermission = !allow ? "not_shared" : current.status === "not_shared" ? "pending" : current.status;
    if (next === current.status) return { success: true, status: next };

    await db
      .update(agencyInterpreters)
      .set({ websitePermissionStatus: next, updatedAt: new Date() })
      .where(thisConnection);

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: allow ? "website_profile_requested" : "website_profile_withdrawn",
      details: `agencyId=${agencyId}; interpreterId=${interpreterId}`,
    });
    if (next === "pending") {
      await notifyAgencyAdmins({
        type: "agency",
        href: "/interpreters?tab=website",
        title: "Website profile request",
        message: `${session.user.name || "An interpreter"} would like to be featured on your website.`,
      });
    }
    return { success: true, status: next };
  } catch (err) {
    logError("setWebsiteSharing", err);
    return { success: false, error: "We could not update website sharing. Please try again." };
  }
}
