"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { agencyInterpreters, interpreters } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { notifyInterpreter } from "@/lib/notifications";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";

/**
 * Approval queue for "connect with an agency" requests. Registration itself needs no approval; what the agency
 * approves is an interpreter's request to join its roster. Staff only see and decide requests for THEIR agency.
 * (Staff accounts have no agency of their own yet, so the workspace's single agency is used.)
 */
const staffAgencyId = (): string => DEFAULT_AGENCY_ID;

export interface PendingConnection {
  id: string;
  interpreterName: string;
  email: string;
  requestedAt: string;
}

const updateSchema = z.object({
  connectionId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
});

export type UpdateConnectionResult = { success: true } | { success: false; error: string };

/** Pending connection requests for the staff member's agency, oldest first. */
export async function getPendingConnectionRequests(): Promise<PendingConnection[]> {
  await requireRole("agency");

  const rows = await db
    .select({
      id: agencyInterpreters.id,
      name: interpreters.name,
      email: interpreters.email,
      createdAt: agencyInterpreters.createdAt,
    })
    .from(agencyInterpreters)
    .innerJoin(interpreters, eq(agencyInterpreters.interpreterId, interpreters.id))
    .where(and(eq(agencyInterpreters.agencyId, staffAgencyId()), eq(agencyInterpreters.status, "pending")))
    .orderBy(asc(agencyInterpreters.createdAt));

  return rows.map((r) => ({ id: r.id, interpreterName: r.name, email: r.email, requestedAt: r.createdAt.toISOString() }));
}

/** Approve or reject one request. The row must belong to the staff member's agency. */
export async function updateConnectionStatus(input: z.input<typeof updateSchema>): Promise<UpdateConnectionResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: "You don't have permission to do this." };
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { connectionId, status } = parsed.data;

  try {
    const [updated] = await db
      .update(agencyInterpreters)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(agencyInterpreters.id, connectionId), eq(agencyInterpreters.agencyId, staffAgencyId())))
      .returning({ interpreterId: agencyInterpreters.interpreterId });
    if (!updated) return { success: false, error: "Request not found." };

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: status === "approved" ? "agency_connection_approved" : "agency_connection_rejected",
      details: `connectionId=${connectionId}; interpreterId=${updated.interpreterId}`,
    });

    await notifyInterpreter(updated.interpreterId, {
      type: "agency",
      href: "/agencies",
      title: status === "approved" ? "Connection approved" : "Connection request declined",
      message: status === "approved" ? "Your agency approved your connection request." : "Your agency declined your connection request.",
    });

    revalidatePath("/dashboard");
    revalidatePath("/interpreters");
    return { success: true };
  } catch (err) {
    logError("updateConnectionStatus", err);
    return { success: false, error: "Could not update this request. Please try again." };
  }
}
