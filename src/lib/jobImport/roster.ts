import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agencyInterpreters, interpreters } from "@/db/schema";
import { ensureDisplayNameColumns } from "@/lib/displayName";
import { interpreterDisplayName } from "@/lib/displayNameSql";
import type { RosterCandidate } from "@/lib/jobImport/match";

/**
 * Everyone on this agency's approved roster (archived people included: a past job may well have been theirs), with the
 * spellings a job sheet might use: the account name and the profile's preferred name. SERVER ONLY.
 */
export async function loadRosterCandidates(agencyId: string): Promise<RosterCandidate[]> {
  await ensureDisplayNameColumns();
  const rows = await db
    .select({ id: interpreters.id, accountName: interpreters.name, displayName: interpreterDisplayName })
    .from(interpreters)
    .innerJoin(agencyInterpreters, eq(agencyInterpreters.interpreterId, interpreters.id))
    .where(and(eq(agencyInterpreters.agencyId, agencyId), eq(agencyInterpreters.status, "approved")));
  return rows.map((row) => ({
    id: row.id,
    label: row.displayName || row.accountName,
    names: Array.from(new Set([row.accountName, row.displayName].filter((n): n is string => Boolean(n)))),
  }));
}
