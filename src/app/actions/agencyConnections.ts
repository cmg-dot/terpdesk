"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agencyInterpreters } from "@/db/schema";
import type { ConnectionStatus } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { requireInterpreter } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";

export interface MyConnection {
  id: string;
  agencyId: string;
  status: ConnectionStatus;
}

export type RequestConnectionResult = { success: true } | { success: false; error: string };

const agencyIdSchema = z.string().trim().min(1).max(100);

/** Every connection (approved, pending, rejected) the signed-in interpreter has with an agency. */
export async function getMyConnections(): Promise<MyConnection[]> {
  const { interpreterId } = await requireInterpreter();
  const rows = await db
    .select({ id: agencyInterpreters.id, agencyId: agencyInterpreters.agencyId, status: agencyInterpreters.status })
    .from(agencyInterpreters)
    .where(eq(agencyInterpreters.interpreterId, interpreterId))
    .orderBy(desc(agencyInterpreters.createdAt));
  return rows;
}

/**
 * "Connect with an agency": records a pending request that the agency's staff approve or reject.
 * The interpreter is always the signed-in one; nothing is granted until the agency approves.
 */
export async function requestAgencyConnection(agencyIdInput: string): Promise<RequestConnectionResult> {
  let interpreterId: string;
  let userId: string;
  let userEmail: string | null;
  try {
    const { session, interpreterId: id } = await requireInterpreter();
    interpreterId = id;
    userId = session.user.id;
    userEmail = session.user.email ?? null;
  } catch {
    return { success: false, error: "Verify your email before connecting with an agency." };
  }

  const parsed = agencyIdSchema.safeParse(agencyIdInput);
  // Agencies are not stored in the database yet, so the only agency a request can target is the workspace's own.
  if (!parsed.success || parsed.data !== DEFAULT_AGENCY_ID) return { success: false, error: "Invalid join code." };
  const agencyId = parsed.data;

  try {
    const [existing] = await db
      .select({ status: agencyInterpreters.status })
      .from(agencyInterpreters)
      .where(and(eq(agencyInterpreters.agencyId, agencyId), eq(agencyInterpreters.interpreterId, interpreterId)))
      .limit(1);

    if (existing?.status === "approved") return { success: false, error: "You are already connected to this agency." };
    if (existing?.status === "pending") return { success: false, error: "You already have a pending request for this agency." };
    if (existing?.status === "rejected") {
      return { success: false, error: "This agency declined your earlier request. Contact the agency if this is a mistake." };
    }

    await db.insert(agencyInterpreters).values({ agencyId, interpreterId, userId, status: "pending" });
    await writeAuditLog({ userId, userEmail, action: "agency_connection_requested", details: `agencyId=${agencyId}` });
    return { success: true };
  } catch (err) {
    // Two clicks racing hit the unique (agency, interpreter) index.
    if ((err as { code?: string; cause?: { code?: string } } | null)?.code === "23505" || (err as { cause?: { code?: string } } | null)?.cause?.code === "23505") {
      return { success: false, error: "You already have a pending request for this agency." };
    }
    logError("requestAgencyConnection", err);
    return { success: false, error: "Could not send your request. Please try again." };
  }
}
