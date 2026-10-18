"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters } from "@/db/schema";
import { requireInterpreter } from "@/lib/auth/guards";

/**
 * Agencies whose roster the signed-in interpreter is already on (e.g. through a shadow profile they claimed).
 * Always scoped to the session's own profile.
 */
export async function getMyRosterAgencyIds(): Promise<string[]> {
  const { interpreterId } = await requireInterpreter();
  const [row] = await db
    .select({ rosterAgencyId: interpreters.rosterAgencyId })
    .from(interpreters)
    .where(eq(interpreters.id, interpreterId))
    .limit(1);
  return row?.rosterAgencyId ? [row.rosterAgencyId] : [];
}
