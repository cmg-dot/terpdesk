import { asc, and, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/db";
import { agencyInterpreters, interpreters } from "@/db/schema";

/**
 * An agency's roster = interpreters with an APPROVED connection to it (agency_interpreters). That includes shadow /
 * external profiles the agency created itself (they get an approved row on creation). Anyone who merely registered,
 * or whose join request is still pending or was rejected, is not on the roster.
 *
 * SERVER ONLY: queries the database.
 */
export async function getRosterInterpreters(agencyId: string) {
  return db
    .select(getTableColumns(interpreters))
    .from(interpreters)
    .innerJoin(agencyInterpreters, eq(agencyInterpreters.interpreterId, interpreters.id))
    .where(and(eq(agencyInterpreters.agencyId, agencyId), eq(agencyInterpreters.status, "approved")))
    .orderBy(asc(interpreters.name));
}
