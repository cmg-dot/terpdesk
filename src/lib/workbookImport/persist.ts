import { createHash, randomUUID } from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { agencyInterpreters, interpreterProfiles, interpreters } from "@/db/schema";
import { placeholderEmailFor } from "@/lib/placeholderEmail";
import type { MergedInterpreter, PersistOutcome } from "@/lib/workbookImport/types";

/**
 * Writes the merged people to the database in ONE transaction: all of it or none of it. SERVER ONLY; the caller must
 * have checked the agency role.
 *
 * - A person is identified by email (case-insensitive). No email on the sheet: a stable placeholder (see
 *   lib/placeholderEmail.ts), so their rates still import and a re-import finds them again.
 * - New people get an interpreter row (shadow profile), an approved roster entry for this agency and a profile row
 *   holding city, insurance expiration and the three rates, each inserted in batches.
 * - People who already exist are never overwritten: only blank fields are filled, and only for people already on this
 *   agency's roster. Anyone else's account is left alone.
 * - With `commit: false` everything runs and is then rolled back, so a preview reports exactly what an import would do.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ProfileInsert = typeof interpreterProfiles.$inferInsert;

const CHUNK = 200;
const chunked = <T>(items: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
};

class DryRun extends Error {}

const emailFor = (person: MergedInterpreter): string =>
  person.email ?? placeholderEmailFor(createHash("sha256").update(person.key).digest("hex"));

/** The profile columns this import is allowed to write. */
const profileFields = (person: MergedInterpreter) => ({
  city: person.city,
  liabilityInsuranceExpiration: person.insuranceExpiration,
  stateRate: person.stateRate,
  kingCountyRate: person.kingCountyRate,
  nonStateRate: person.nonStateRate,
});

async function write(tx: Tx, people: readonly MergedInterpreter[], agencyId: string): Promise<PersistOutcome> {
  const entries = people.map((person) => ({ person, email: emailFor(person) }));
  const idByEmail = new Map<string, string>();
  const loadIds = async () => {
    for (const batch of chunked(entries.map((e) => e.email))) {
      const found = await tx
        .select({ id: interpreters.id, email: sql<string>`lower(${interpreters.email})` })
        .from(interpreters)
        .where(inArray(sql`lower(${interpreters.email})`, batch));
      for (const row of found) idByEmail.set(row.email, row.id);
    }
  };
  await loadIds();
  const existingIds = new Set(idByEmail.values());

  // New people: interpreter rows first, then their roster entries.
  const fresh = entries.filter((e) => !idByEmail.has(e.email));
  const createdIds = new Set<string>();
  for (const batch of chunked(fresh)) {
    const inserted = await tx
      .insert(interpreters)
      .values(batch.map((e) => ({ name: e.person.name, email: e.email })))
      .onConflictDoNothing({ target: interpreters.email })
      .returning({ id: interpreters.id, email: interpreters.email });
    for (const row of inserted) {
      idByEmail.set(row.email.toLowerCase(), row.id);
      createdIds.add(row.id);
    }
    if (inserted.length > 0) {
      await tx
        .insert(agencyInterpreters)
        .values(inserted.map((row) => ({ agencyId, interpreterId: row.id, status: "approved" as const })))
        .onConflictDoNothing();
    }
  }

  // Existing people only count if this agency has them on its approved roster.
  const onRoster = new Set<string>();
  for (const batch of chunked(Array.from(existingIds))) {
    const rows = await tx
      .select({ interpreterId: agencyInterpreters.interpreterId })
      .from(agencyInterpreters)
      .where(and(eq(agencyInterpreters.agencyId, agencyId), eq(agencyInterpreters.status, "approved"), inArray(agencyInterpreters.interpreterId, batch)));
    for (const row of rows) onRoster.add(row.interpreterId);
  }

  const outcome: PersistOutcome = { created: createdIds.size, filledExisting: 0, unchangedExisting: 0, skippedNotOnRoster: 0 };
  const targets: { id: string; person: MergedInterpreter; isNew: boolean }[] = [];
  for (const { person, email } of entries) {
    const id = idByEmail.get(email.toLowerCase());
    if (!id) continue; // lost a race with a concurrent insert: that other import owns this person
    if (createdIds.has(id)) targets.push({ id, person, isNew: true });
    else if (onRoster.has(id)) targets.push({ id, person, isNew: false });
    else outcome.skippedNotOnRoster += 1;
  }

  // Newest profile per interpreter (older data can hold several rows per interpreter).
  const newestProfile = new Map<string, typeof interpreterProfiles.$inferSelect>();
  for (const batch of chunked(targets.map((t) => t.id))) {
    const rows = await tx.select().from(interpreterProfiles).where(inArray(interpreterProfiles.interpreterId, batch)).orderBy(desc(interpreterProfiles.updatedAt));
    for (const row of rows) if (!newestProfile.has(row.interpreterId)) newestProfile.set(row.interpreterId, row);
  }

  const newProfiles: ProfileInsert[] = [];
  for (const { id, person, isNew } of targets) {
    const current = newestProfile.get(id);
    const wanted = profileFields(person);
    if (!current) {
      newProfiles.push({ id: randomUUID(), interpreterId: id, ...wanted });
      if (!isNew) outcome.filledExisting += 1;
      continue;
    }
    const blanks: Partial<typeof wanted> = {};
    if (current.city === null && wanted.city !== null) blanks.city = wanted.city;
    if (current.liabilityInsuranceExpiration === null && wanted.liabilityInsuranceExpiration !== null) blanks.liabilityInsuranceExpiration = wanted.liabilityInsuranceExpiration;
    if (current.stateRate === null && wanted.stateRate !== null) blanks.stateRate = wanted.stateRate;
    if (current.kingCountyRate === null && wanted.kingCountyRate !== null) blanks.kingCountyRate = wanted.kingCountyRate;
    if (current.nonStateRate === null && wanted.nonStateRate !== null) blanks.nonStateRate = wanted.nonStateRate;
    if (Object.keys(blanks).length === 0) {
      if (!isNew) outcome.unchangedExisting += 1;
      continue;
    }
    // Only the filled columns change; updated_at is left alone so the profile does not look edited by its owner.
    await tx.update(interpreterProfiles).set(blanks).where(eq(interpreterProfiles.id, current.id));
    if (!isNew) outcome.filledExisting += 1;
  }
  for (const batch of chunked(newProfiles)) await tx.insert(interpreterProfiles).values(batch);

  return outcome;
}

export async function persistMerged(people: readonly MergedInterpreter[], options: { agencyId: string; commit: boolean }): Promise<PersistOutcome> {
  const result: { outcome?: PersistOutcome } = {};
  try {
    await db.transaction(async (tx) => {
      result.outcome = await write(tx, people, options.agencyId);
      if (!options.commit) throw new DryRun();
    });
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  }
  if (!result.outcome) throw new Error("The import produced no result.");
  return result.outcome;
}
