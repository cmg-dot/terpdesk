"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agencyInterpreters } from "@/db/schema";
import { requireInterpreter } from "@/lib/auth/guards";

/**
 * Agencies the signed-in interpreter is connected to (approved connections only).
 * Always scoped to the session's own profile.
 */
export async function getMyRosterAgencyIds(): Promise<string[]> {
  const { interpreterId } = await requireInterpreter();
  const rows = await db
    .select({ agencyId: agencyInterpreters.agencyId })
    .from(agencyInterpreters)
    .where(and(eq(agencyInterpreters.interpreterId, interpreterId), eq(agencyInterpreters.status, "approved")));
  return rows.map((r) => r.agencyId);
}
