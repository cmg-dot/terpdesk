"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { availabilityExceptions, availabilityRules, availabilityShares, busyBlocks, interpreterProfiles } from "@/db/schema";
import { ensureAvailabilityTables } from "@/lib/availability/ensureTables";
import { resolveInterpreterIds } from "@/lib/availability/ids";
import { assertOwnInterpreterId, requireRole } from "@/lib/auth/guards";

/**
 * Fetch availability view data for an interpreter across resolved IDs.
 */
export async function td_availability_view(interpreterId: string) {
  const ownSession = await requireRole("interpreter");
  assertOwnInterpreterId(ownSession, interpreterId);
  await ensureAvailabilityTables();
  const targetIds = await resolveInterpreterIds(interpreterId);

  const profiles = await db
    .select()
    .from(interpreterProfiles)
    .where(inArray(interpreterProfiles.interpreterId, targetIds))
    .limit(1);

  const rules = await db
    .select()
    .from(availabilityRules)
    .where(inArray(availabilityRules.interpreterId, targetIds));

  const exceptions = await db
    .select()
    .from(availabilityExceptions)
    .where(inArray(availabilityExceptions.interpreterId, targetIds));

  const blocks = await db
    .select()
    .from(busyBlocks)
    .where(inArray(busyBlocks.interpreterId, targetIds));

  const shares = await db
    .select()
    .from(availabilityShares)
    .where(inArray(availabilityShares.interpreterId, targetIds));

  // This goes to the interpreter's browser, so only the fields its callers use are returned. Never the whole row:
  // interpreter_profiles also holds agency-only data (the State / Non-state rates an agency sets).
  const row = profiles[0];
  return {
    profile: row
      ? { id: row.id, interpreterId: row.interpreterId, timeZone: row.timeZone, updatedAt: row.updatedAt }
      : { id: "default", interpreterId, timeZone: "America/Los_Angeles", updatedAt: new Date() },
    rules,
    exceptions: exceptions.map((e) => ({
      id: e.id,
      date: e.onDate,
      available: e.available,
      startMinute: e.startMinute ?? undefined,
      endMinute: e.endMinute ?? undefined,
    })),
    busyBlocks: blocks.map((b) => ({
      id: b.id,
      title: b.title,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      timeZone: b.timeZone || "America/Los_Angeles",
      revision: b.revision,
    })),
    shares,
  };
}

/**
 * Toggle availability sharing with an agency.
 */
export async function td_toggle_share(params: {
  interpreterId: string;
  agencyId: string;
  enabled: boolean;
}) {
  const ownSession = await requireRole("interpreter");
  assertOwnInterpreterId(ownSession, params.interpreterId);
  await ensureAvailabilityTables();
  const { interpreterId, agencyId, enabled } = params;
  const targetIds = await resolveInterpreterIds(interpreterId);

  for (const tid of targetIds) {
    const [existing] = await db
      .select()
      .from(availabilityShares)
      .where(
        and(
          eq(availabilityShares.interpreterId, tid),
          eq(availabilityShares.agencyId, agencyId)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(availabilityShares)
        .set({ enabled })
        .where(eq(availabilityShares.id, existing.id));
    } else {
      await db.insert(availabilityShares).values({
        id: crypto.randomUUID(),
        agencyId,
        interpreterId: tid,
        enabled,
      });
    }
  }

  revalidatePath("/agencies");
  revalidatePath("/interpreter-home");
  return { success: true, enabled };
}
