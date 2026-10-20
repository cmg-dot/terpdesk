import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { interpreterProfiles } from "@/db/schema";
import { toPublicProfile } from "@/lib/websiteProfile";
import type { PublicProfile } from "@/lib/websiteProfile";

/**
 * Public website profiles for the given interpreters: photo, name, service area and bio ONLY.
 * Contact details are never selected, so they cannot leak into an agency's website view.
 *
 * SERVER ONLY: queries the database. Call ensureAvailabilityTables first (it adds the profile columns).
 */
export async function publicProfilesFor(interpreters: { id: string; name: string }[]): Promise<Map<string, PublicProfile>> {
  const result = new Map<string, PublicProfile>();
  if (interpreters.length === 0) return result;

  const rows = await db
    .select({
      interpreterId: interpreterProfiles.interpreterId,
      preferredName: interpreterProfiles.preferredName,
      photoUrl: interpreterProfiles.photoUrl,
      serviceArea: interpreterProfiles.serviceArea,
      shortBio: interpreterProfiles.shortBio,
    })
    .from(interpreterProfiles)
    .where(inArray(interpreterProfiles.interpreterId, interpreters.map((i) => i.id)))
    // Older data can hold more than one row per interpreter; the newest wins.
    .orderBy(desc(interpreterProfiles.updatedAt));

  for (const interpreter of interpreters) {
    const row = rows.find((r) => r.interpreterId === interpreter.id);
    result.set(
      interpreter.id,
      toPublicProfile({
        preferredName: row?.preferredName ?? "",
        fullName: interpreter.name,
        photoUrl: row?.photoUrl ?? "",
        serviceArea: row?.serviceArea ?? "",
        shortBio: row?.shortBio ?? "",
      }),
    );
  }
  return result;
}
