import { asc, and, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/db";
import { agencyInterpreters, interpreters } from "@/db/schema";
import { ensureDisplayNameColumns } from "@/lib/displayName";
import { interpreterDisplayName, interpreterPhotoUrl } from "@/lib/displayNameSql";

/**
 * An agency's roster = interpreters with an APPROVED connection to it (agency_interpreters). That includes shadow /
 * external profiles the agency created itself (they get an approved row on creation). Anyone who merely registered,
 * or whose join request is pending, rejected, or revoked, is not on the roster.
 * `rosterActive` is false for archived people: they stay listed (so they can be reactivated) but must not be
 * dispatched, so dispatch callers pass `activeOnly`.
 * `name` is the display name (preferred name, else account name), so the roster and offer dropdowns agree.
 * `photoUrl` is the profile photo path ("/api/files/<id>") or null, so lists can show it instead of initials.
 *
 * SERVER ONLY: queries the database.
 */
export async function getRosterInterpreters(agencyId: string, opts: { activeOnly?: boolean } = {}) {
  await ensureDisplayNameColumns();
  const conditions = [eq(agencyInterpreters.agencyId, agencyId), eq(agencyInterpreters.status, "approved")];
  if (opts.activeOnly) conditions.push(eq(agencyInterpreters.isActive, true));
  return db
    .select({
      ...getTableColumns(interpreters),
      name: interpreterDisplayName,
      photoUrl: interpreterPhotoUrl,
      rosterActive: agencyInterpreters.isActive,
    })
    .from(interpreters)
    .innerJoin(agencyInterpreters, eq(agencyInterpreters.interpreterId, interpreters.id))
    .where(and(...conditions))
    .orderBy(asc(interpreterDisplayName));
}

export type RosterInterpreter = Awaited<ReturnType<typeof getRosterInterpreters>>[number];
