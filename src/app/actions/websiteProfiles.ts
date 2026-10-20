"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { agencyInterpreters, interpreters } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { ensureAgencyInterpreterColumns } from "@/lib/agencyInterpreterColumns";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { notifyInterpreter } from "@/lib/notifications";
import { publicProfilesFor } from "@/lib/publicProfile";
import type { WebsitePermission, WebsiteProfileRequest } from "@/lib/websiteProfile";

/** Staff accounts have no agency of their own yet, so the workspace's single agency is used. */
const staffAgencyId = (): string => DEFAULT_AGENCY_ID;

const decisionSchema = z.object({
  connectionId: z.string().uuid(),
  decision: z.enum(["approve", "decline", "remove"]),
});

export type DecideWebsiteProfileResult = { success: true; status: WebsitePermission } | { success: false; error: string };

/** Connected interpreters who opted in to the agency's website (pending) or were approved, with public fields only. */
export async function getWebsiteProfileRequests(): Promise<WebsiteProfileRequest[]> {
  await requireRole("agency");
  await ensureAgencyInterpreterColumns();
  await ensureAvailabilityTables();

  const rows = await db
    .select({
      connectionId: agencyInterpreters.id,
      interpreterId: interpreters.id,
      name: interpreters.name,
      status: agencyInterpreters.websitePermissionStatus,
    })
    .from(agencyInterpreters)
    .innerJoin(interpreters, eq(agencyInterpreters.interpreterId, interpreters.id))
    .where(
      and(
        eq(agencyInterpreters.agencyId, staffAgencyId()),
        eq(agencyInterpreters.status, "approved"),
        inArray(agencyInterpreters.websitePermissionStatus, ["pending", "approved"]),
      ),
    )
    .orderBy(asc(interpreters.name));

  const profiles = await publicProfilesFor(rows.map((r) => ({ id: r.interpreterId, name: r.name })));
  return rows.map((r) => ({
    connectionId: r.connectionId,
    status: r.status === "approved" ? "approved" : "pending",
    profile: profiles.get(r.interpreterId) ?? { name: r.name, photoUrl: "", serviceArea: "", bio: "" },
  }));
}

/**
 * Approve or decline a pending website request, or remove an approved profile from the website.
 * Each decision only applies from the matching state, so a stale screen cannot override a newer change.
 */
export async function decideWebsiteProfile(input: z.input<typeof decisionSchema>): Promise<DecideWebsiteProfileResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: "You don't have permission to do this." };
  }
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { connectionId, decision } = parsed.data;

  const from: WebsitePermission = decision === "remove" ? "approved" : "pending";
  const to: WebsitePermission = decision === "approve" ? "approved" : "not_shared";

  try {
    await ensureAgencyInterpreterColumns();
    const [updated] = await db
      .update(agencyInterpreters)
      .set({ websitePermissionStatus: to, updatedAt: new Date() })
      .where(
        and(
          eq(agencyInterpreters.id, connectionId),
          eq(agencyInterpreters.agencyId, staffAgencyId()),
          eq(agencyInterpreters.status, "approved"),
          eq(agencyInterpreters.websitePermissionStatus, from),
        ),
      )
      .returning({ interpreterId: agencyInterpreters.interpreterId });
    if (!updated) return { success: false, error: "This request changed in the meantime. Refresh the page to see its current state." };

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: `website_profile_${decision}`,
      details: `connectionId=${connectionId}; interpreterId=${updated.interpreterId}`,
    });
    await notifyInterpreter(updated.interpreterId, {
      type: "agency",
      href: "/profile",
      title: decision === "approve" ? "Website profile approved" : "Website profile not shown",
      message:
        decision === "approve"
          ? "Your agency approved featuring your public profile on its website."
          : decision === "decline"
            ? "Your agency declined featuring your public profile on its website."
            : "Your agency removed your public profile from its website.",
    });
    revalidatePath("/interpreters");
    return { success: true, status: to };
  } catch (err) {
    logError("decideWebsiteProfile", err);
    return { success: false, error: "We could not save this decision. Please try again." };
  }
}
