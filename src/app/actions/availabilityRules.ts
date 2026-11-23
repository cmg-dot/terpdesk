"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { availabilityExceptions, availabilityRules, interpreterProfiles } from "@/db/schema";
import { ensureAvailabilityTables } from "@/lib/availability/ensureTables";
import { resolveInterpreterIds } from "@/lib/availability/ids";
import type { AvailabilityExceptionInput, AvailabilityRuleInput } from "@/lib/availability/types";
import { assertOwnInterpreterId, requireRole } from "@/lib/auth/guards";
import { getIanaZone } from "@/utils/timezone";

/**
 * Save availability rules, exceptions, and profile timezone to PostgreSQL.
 * Replaces weekly rules for the interpreter across all resolved IDs.
 */
export async function td_save_availability(params: {
  interpreterId: string;
  timeZone?: string;
  rules: AvailabilityRuleInput[];
  exceptions?: AvailabilityExceptionInput[];
}) {
  const ownSession = await requireRole("interpreter");
  assertOwnInterpreterId(ownSession, params.interpreterId);
  await ensureAvailabilityTables();
  const { interpreterId, timeZone, rules, exceptions = [] } = params;
  const targetIds = await resolveInterpreterIds(interpreterId);
  const now = new Date();
  const safeZone = getIanaZone(timeZone || "America/Los_Angeles");

  for (const tid of targetIds) {
    // 1. Persist timezone to interpreter_profiles
    const [existingProfile] = await db
      .select()
      .from(interpreterProfiles)
      .where(eq(interpreterProfiles.interpreterId, tid))
      .limit(1);

    if (existingProfile) {
      await db
        .update(interpreterProfiles)
        .set({
          timeZone: safeZone,
          updatedAt: now,
        })
        .where(eq(interpreterProfiles.id, existingProfile.id));
    } else {
      await db.insert(interpreterProfiles).values({
        id: crypto.randomUUID(),
        interpreterId: tid,
        timeZone: safeZone,
        updatedAt: now,
      });
    }

    // 2. Replace existing availability_rules
    await db
      .delete(availabilityRules)
      .where(eq(availabilityRules.interpreterId, tid));

    if (rules.length > 0) {
      const rulesToInsert = rules.map((r) => ({
        id: crypto.randomUUID(),
        interpreterId: tid,
        weekday: r.weekday,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
      }));
      await db.insert(availabilityRules).values(rulesToInsert);
    }

    // 3. Replace existing availability_exceptions
    await db
      .delete(availabilityExceptions)
      .where(eq(availabilityExceptions.interpreterId, tid));

    if (exceptions.length > 0) {
      const exceptionsToInsert = exceptions.map((e) => ({
        id: crypto.randomUUID(),
        interpreterId: tid,
        onDate: e.date,
        available: e.available,
        startMinute: e.startMinute ?? null,
        endMinute: e.endMinute ?? null,
      }));
      await db.insert(availabilityExceptions).values(exceptionsToInsert);
    }
  }

  revalidatePath("/interpreter-calendar");
  revalidatePath("/interpreter-home");
  revalidatePath("/requests");
  return { success: true };
}

/**
 * Update interpreter's profile timezone in PostgreSQL.
 */
export async function td_update_interpreter_timezone(params: {
  interpreterId: string;
  timeZone: string;
}): Promise<{ success: boolean; timeZone: string }> {
  const ownSession = await requireRole("interpreter");
  assertOwnInterpreterId(ownSession, params.interpreterId);
  await ensureAvailabilityTables();
  const { interpreterId, timeZone } = params;
  const targetIds = await resolveInterpreterIds(interpreterId);
  const now = new Date();
  const safeZone = getIanaZone(timeZone || "America/Los_Angeles");

  for (const tid of targetIds) {
    const [existingProfile] = await db
      .select()
      .from(interpreterProfiles)
      .where(eq(interpreterProfiles.interpreterId, tid))
      .limit(1);

    if (existingProfile) {
      await db
        .update(interpreterProfiles)
        .set({
          timeZone: safeZone,
          updatedAt: now,
        })
        .where(eq(interpreterProfiles.id, existingProfile.id));
    } else {
      await db.insert(interpreterProfiles).values({
        id: crypto.randomUUID(),
        interpreterId: tid,
        timeZone: safeZone,
        updatedAt: now,
      });
    }
  }

  revalidatePath("/interpreter-calendar");
  revalidatePath("/interpreter-home");
  return { success: true, timeZone: safeZone };
}
