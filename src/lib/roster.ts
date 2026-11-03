import { asc, and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db";
import { agencyInterpreters, interpreterProfiles, interpreters } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { ensureDisplayNameColumns } from "@/lib/displayName";
import { interpreterDisplayName, interpreterPhotoUrl } from "@/lib/displayNameSql";
import { areasFromLegacy, cleanAreas } from "@/lib/serviceAreas";

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

/**
 * Each roster person's credentials text (the agency-private certification), keyed by interpreter id; people with none are
 * absent. Newest profile row wins when older data holds several. For the agency's Interpreters page only: it must never
 * go to an interpreter's browser. SERVER ONLY.
 */
export async function getRosterCertifications(agencyId: string): Promise<Map<string, string>> {
  const byInterpreter = new Map<string, string>();
  for (const [id, profile] of Array.from(await getRosterProfileTags(agencyId))) {
    if (profile.certification !== "") byInterpreter.set(id, profile.certification);
  }
  return byInterpreter;
}

export interface RosterProfileTags {
  /** The agency-private certification text, trimmed ("" when none). */
  certification: string;
  /** Service-area tags ("Seattle", "Virtual Only"); a profile saved before tags existed falls back to its one-line service area. */
  areas: string[];
}

/**
 * What the Interpreter View's filters need from each roster person's profile, keyed by interpreter id (people with no
 * profile are absent). Newest profile row wins when older data holds several. Agency-only data: the certification must
 * never go to an interpreter's browser. SERVER ONLY.
 */
export async function getRosterProfileTags(agencyId: string): Promise<Map<string, RosterProfileTags>> {
  await ensureAvailabilityTables();
  const rows = await db
    .select({
      interpreterId: interpreterProfiles.interpreterId,
      certification: interpreterProfiles.certification,
      serviceAreas: interpreterProfiles.serviceAreas,
      serviceArea: interpreterProfiles.serviceArea,
    })
    .from(interpreterProfiles)
    .innerJoin(
      agencyInterpreters,
      and(
        eq(agencyInterpreters.agencyId, agencyId),
        eq(agencyInterpreters.status, "approved"),
        sql`${agencyInterpreters.interpreterId}::text = ${interpreterProfiles.interpreterId}`,
      ),
    )
    .orderBy(desc(interpreterProfiles.updatedAt));
  const byInterpreter = new Map<string, RosterProfileTags>();
  for (const row of rows) {
    if (byInterpreter.has(row.interpreterId)) continue;
    const tagged = cleanAreas(row.serviceAreas ?? []);
    byInterpreter.set(row.interpreterId, {
      certification: (row.certification ?? "").trim(),
      areas: tagged.length > 0 ? tagged : areasFromLegacy(row.serviceArea),
    });
  }
  return byInterpreter;
}
