"use server";

import { requireRole, assertOwnInterpreterId } from "@/lib/auth/guards";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { db } from "@/db";
import {
  interpreterProfiles,
  availabilityRules,
  availabilityExceptions,
  busyBlocks,
  availabilityShares,
  offers,
  requests,
  interpreters,
} from "@/db/schema";
import { eq, and, sql, lt, gt, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { formatInTimeZone } from "date-fns-tz";
import { getIanaZone, resolveRequestTimes, wallClockToUtcDate } from "@/utils/timezone";

let tablesEnsured = false;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

let ensureInFlight: Promise<void> | null = null;

// Any constant: all instances that run the schema script below take the same lock.
const SCHEMA_LOCK_KEY = 727346101;

/**
 * Auto-migration pattern: creates availability tables in PostgreSQL if not present.
 * Pages call this from several actions at once (e.g. the dashboard on a cold start). Callers in the same process share
 * one run, and the script holds a Postgres advisory lock, so two server instances can't run it at the same time and
 * collide on "concurrent create" errors.
 */
export async function ensureAvailabilityTables(): Promise<void> {
  if (tablesEnsured) return;
  if (!ensureInFlight) {
    ensureInFlight = runEnsureAvailabilityTables().finally(() => {
      ensureInFlight = null;
    });
  }
  await ensureInFlight;
}

async function runEnsureAvailabilityTables(): Promise<void> {
  try {
    await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY})`);
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS interpreter_profiles (
        id TEXT PRIMARY KEY,
        interpreter_id TEXT NOT NULL,
        time_zone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS availability_rules (
        id TEXT PRIMARY KEY,
        interpreter_id TEXT NOT NULL,
        weekday SMALLINT NOT NULL,
        start_minute INTEGER NOT NULL,
        end_minute INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS availability_exceptions (
        id TEXT PRIMARY KEY,
        interpreter_id TEXT NOT NULL,
        on_date TEXT NOT NULL,
        available BOOLEAN NOT NULL DEFAULT false,
        start_minute INTEGER,
        end_minute INTEGER
      );

      CREATE TABLE IF NOT EXISTS busy_blocks (
        id TEXT PRIMARY KEY,
        interpreter_id TEXT NOT NULL,
        title TEXT,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        time_zone TEXT,
        revision INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS availability_shares (
        id TEXT PRIMARY KEY,
        agency_id TEXT NOT NULL,
        interpreter_id TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true
      );

      ALTER TABLE availability_shares ADD COLUMN IF NOT EXISTS allows_auto_book BOOLEAN NOT NULL DEFAULT false;

      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS preferred_name VARCHAR(80);
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500);
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS short_bio TEXT;
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS city VARCHAR(100);
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS state_or_region VARCHAR(100);
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS service_area VARCHAR(200);
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS takes_in_person BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS takes_virtual BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS work_email VARCHAR(255);
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS work_phone VARCHAR(30);
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS contact_visibility VARCHAR(10) NOT NULL DEFAULT 'private';

      CREATE TABLE IF NOT EXISTS credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        interpreter_id UUID NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        type VARCHAR(20) NOT NULL,
        issued_by VARCHAR(150),
        credential_number VARCHAR(100),
        issue_date DATE,
        expiration_date DATE,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS credentials_interpreter_idx ON credentials (interpreter_id);
      ALTER TABLE credentials ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

      CREATE TABLE IF NOT EXISTS credential_agency_shares (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        credential_id UUID NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
        agency_id TEXT NOT NULL,
        include_files BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS credential_agency_shares_credential_agency_idx
        ON credential_agency_shares (credential_id, agency_id);

      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_url TEXT NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        file_name VARCHAR(255) NOT NULL,
        content_type VARCHAR(100) NOT NULL,
        size_bytes INTEGER NOT NULL,
        uploaded_by_agency_id TEXT,
        uploaded_by_interpreter_id UUID REFERENCES interpreters(id) ON DELETE SET NULL,
        linked_job_id UUID REFERENCES requests(id) ON DELETE CASCADE,
        linked_credential_id UUID REFERENCES credentials(id) ON DELETE CASCADE,
        shared_with_interpreters BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS files_linked_job_idx ON files (linked_job_id);

      CREATE INDEX IF NOT EXISTS idx_avail_rules_interp ON availability_rules (interpreter_id);
      CREATE INDEX IF NOT EXISTS idx_avail_exceptions_interp ON availability_exceptions (interpreter_id);
      CREATE INDEX IF NOT EXISTS idx_busy_blocks_interp ON busy_blocks (interpreter_id);
      CREATE INDEX IF NOT EXISTS idx_avail_shares_interp ON availability_shares (interpreter_id);
    `);
    });
    tablesEnsured = true;

    // Seed default Mon-Fri rules for terp-1 if no rules exist in the table
    try {
      const existingRules = await db
        .select({ id: availabilityRules.id })
        .from(availabilityRules)
        .limit(1);

      if (existingRules.length === 0) {
        const defaultWeekdays = [1, 2, 3, 4, 5]; // Mon - Fri
        const targetIds = await resolveInterpreterIds("terp-1");
        for (const tid of targetIds) {
          for (const wd of defaultWeekdays) {
            await db.insert(availabilityRules).values({
              id: crypto.randomUUID(),
              interpreterId: tid,
              weekday: wd,
              startMinute: 540, // 9:00 AM
              endMinute: 1020,  // 5:00 PM
            });
          }
        }
      }
    } catch (seedErr) {
      console.warn("Could not seed default availability rules:", seedErr);
    }
  } catch (err) {
    console.error("Failed to ensure availability tables:", err);
  }
}

/**
 * Bridges mock test IDs ('terp-1', 'terp-new') and PostgreSQL UUIDs so availability
 * saved in interpreter views is immediately found by agency views and vice versa.
 */
export async function resolveInterpreterIds(interpreterId: string): Promise<string[]> {
  const ids = new Set<string>([interpreterId]);
  const mockEmailMap: Record<string, string> = {
    "terp-1": "dale.fictional@example.com",
    "terp-new": "new.terp@example.com",
    "active-terp": "dale.fictional@example.com",
  };

  const email = mockEmailMap[interpreterId];
  if (email) {
    try {
      const [row] = await db
        .select({ id: interpreters.id })
        .from(interpreters)
        .where(eq(interpreters.email, email))
        .limit(1);
      if (row) {
        ids.add(row.id);
      }
    } catch (e) {}
  } else {
    try {
      const rows = await db
        .select({ id: interpreters.id, email: interpreters.email })
        .from(interpreters)
        .limit(50);
      for (const row of rows) {
        if (row.id === interpreterId) {
          if (row.email === "dale.fictional@example.com") ids.add("terp-1");
          if (row.email === "new.terp@example.com") ids.add("terp-new");
        }
      }
    } catch (e) {}
  }

  return Array.from(ids);
}

export interface AvailabilityRuleInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityExceptionInput {
  date: string;
  available: boolean;
  startMinute?: number;
  endMinute?: number;
}

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

/**
 * Save a private busy block to PostgreSQL.
 * Strictly uses selected timeZone without browser offset distortion.
 * If isAllDay is true: forces starts_at to 00:00:00 of start date in selected timezone,
 * and ends_at to 00:00:00 of the day after the end date in selected timezone, then converts to UTC.
 */
export async function td_save_busy(params: {
  id?: string;
  interpreterId: string;
  title?: string;
  startsAt?: string | Date;
  endsAt?: string | Date;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timeZone?: string;
  isAllDay?: boolean;
  revision?: number;
}) {
  const ownSession = await requireRole("interpreter");
  assertOwnInterpreterId(ownSession, params.interpreterId);
  await ensureAvailabilityTables();
  const {
    id,
    interpreterId,
    title = "Busy",
    startsAt,
    endsAt,
    timeZone,
    isAllDay = false,
    revision = 1,
  } = params;

  const targetIds = await resolveInterpreterIds(interpreterId);
  const primaryId = targetIds[0] || interpreterId;

  let chosenZone = timeZone;
  if (!chosenZone) {
    const [profile] = await db
      .select({ timeZone: interpreterProfiles.timeZone })
      .from(interpreterProfiles)
      .where(inArray(interpreterProfiles.interpreterId, targetIds))
      .limit(1);
    chosenZone = profile?.timeZone || "America/Los_Angeles";
  }
  const safeZone = getIanaZone(chosenZone);

  let startUtc: Date;
  let endUtc: Date;

  if (isAllDay) {
    const startDateStr = (
      params.startDate ||
      (typeof startsAt === "string"
        ? startsAt.split("T")[0]
        : formatInTimeZone(startsAt || new Date(), safeZone, "yyyy-MM-dd"))
    ).trim();

    const rawEndDateStr = (
      params.endDate ||
      (typeof endsAt === "string"
        ? endsAt.split("T")[0]
        : endsAt
        ? formatInTimeZone(endsAt, safeZone, "yyyy-MM-dd")
        : startDateStr)
    ).trim();

    const effectiveEndDateStr = rawEndDateStr < startDateStr ? startDateStr : rawEndDateStr;

    // Force starts_at to 00:00:00 of the start date in chosen zone
    startUtc = wallClockToUtcDate({
      dateStr: startDateStr,
      timeStr: "00:00:00",
      timeZone: safeZone,
    });

    // Force ends_at to 00:00:00 of the day AFTER the end date in chosen zone
    const [ey, em, ed] = effectiveEndDateStr.split("-").map(Number);
    const dayAfterUtc = new Date(Date.UTC(ey, em - 1, ed + 1));
    const dayAfterStr = dayAfterUtc.toISOString().split("T")[0];

    endUtc = wallClockToUtcDate({
      dateStr: dayAfterStr,
      timeStr: "00:00:00",
      timeZone: safeZone,
    });
  } else {
    let sDate = params.startDate;
    let sTime = params.startTime;
    if (!sDate || !sTime) {
      if (typeof startsAt === "string") {
        const [dPart, tPart] = startsAt.split("T");
        sDate = sDate || dPart;
        sTime = sTime || (tPart ? tPart.replace("Z", "").slice(0, 5) : "09:00");
      } else if (startsAt instanceof Date) {
        sDate = sDate || formatInTimeZone(startsAt, safeZone, "yyyy-MM-dd");
        sTime = sTime || formatInTimeZone(startsAt, safeZone, "HH:mm");
      } else {
        sDate = new Date().toISOString().split("T")[0];
        sTime = "09:00";
      }
    }

    startUtc = wallClockToUtcDate({
      dateStr: sDate,
      timeStr: sTime,
      timeZone: safeZone,
    });

    let eDate = params.endDate;
    let eTime = params.endTime;
    if (!eDate || !eTime) {
      if (typeof endsAt === "string") {
        const [dPart, tPart] = endsAt.split("T");
        eDate = eDate || dPart;
        eTime = eTime || (tPart ? tPart.replace("Z", "").slice(0, 5) : "10:00");
      } else if (endsAt instanceof Date) {
        eDate = eDate || formatInTimeZone(endsAt, safeZone, "yyyy-MM-dd");
        eTime = eTime || formatInTimeZone(endsAt, safeZone, "HH:mm");
      } else {
        eDate = sDate;
        eTime = "10:00";
      }
    }

    endUtc = wallClockToUtcDate({
      dateStr: eDate,
      timeStr: eTime,
      timeZone: safeZone,
    });
  }

  const blockId = id || crypto.randomUUID();

  if (id) {
    const [existing] = await db
      .select()
      .from(busyBlocks)
      .where(eq(busyBlocks.id, id))
      .limit(1);

    if (existing) {
      await db
        .update(busyBlocks)
        .set({
          title,
          startsAt: startUtc,
          endsAt: endUtc,
          timeZone: safeZone,
          revision: (existing.revision || 1) + 1,
        })
        .where(eq(busyBlocks.id, id));

      revalidatePath("/interpreter-calendar");
      revalidatePath("/interpreter-home");
      return {
        id,
        interpreterId: primaryId,
        title,
        startsAt: startUtc.toISOString(),
        endsAt: endUtc.toISOString(),
        timeZone: safeZone,
      };
    }
  }

  await db.insert(busyBlocks).values({
    id: blockId,
    interpreterId: primaryId,
    title,
    startsAt: startUtc,
    endsAt: endUtc,
    timeZone: safeZone,
    revision,
  });

  revalidatePath("/interpreter-calendar");
  revalidatePath("/interpreter-home");
  return {
    id: blockId,
    interpreterId: primaryId,
    title,
    startsAt: startUtc.toISOString(),
    endsAt: endUtc.toISOString(),
    timeZone: safeZone,
  };
}

/**
 * Delete a private busy block.
 */
export async function td_delete_busy(busyId: string) {
  const ownSession = await requireRole("interpreter");
  const [busy] = await db.select({ interpreterId: busyBlocks.interpreterId }).from(busyBlocks).where(eq(busyBlocks.id, busyId)).limit(1);
  if (busy) assertOwnInterpreterId(ownSession, busy.interpreterId);
  await ensureAvailabilityTables();
  await db.delete(busyBlocks).where(eq(busyBlocks.id, busyId));
  revalidatePath("/interpreter-calendar");
  revalidatePath("/interpreter-home");
  return { success: true };
}

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

  return {
    profile: profiles[0] || {
      id: "default",
      interpreterId,
      timeZone: "America/Los_Angeles",
      updatedAt: new Date(),
    },
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

/**
 * Check if interpreter has an overlapping booked job or busy block.
 */
export async function td_conflict(params: {
  interpreterId: string;
  startsAtUtc: string | Date;
  endsAtUtc: string | Date;
  excludeRequestId?: string;
}): Promise<{ hasConflict: boolean; reason?: "job" | "busy" }> {
  try {
    await ensureAvailabilityTables();
    const { interpreterId, startsAtUtc, endsAtUtc, excludeRequestId } = params;
    const targetIds = await resolveInterpreterIds(interpreterId);
    const offerInterpreterIds = targetIds.filter(isUuid);
    const startTarget = new Date(startsAtUtc);
    const endTarget = new Date(endsAtUtc);

    // offers.interpreter_id is a UUID column, while availability tables also
    // support mock text IDs such as "terp-1". Never pass those mock IDs to the
    // UUID query.
    if (offerInterpreterIds.length > 0) {
      const acceptedOffers = await db
        .select({
          offerId: offers.id,
          requestId: offers.requestId,
          reqStatus: requests.status,
          reqData: requests.data,
          reqCreatedAt: requests.createdAt,
        })
        .from(offers)
        .innerJoin(requests, eq(offers.requestId, requests.id))
        .where(
          and(
            inArray(offers.interpreterId, offerInterpreterIds),
            eq(offers.status, "accepted")
          )
        );

      for (const row of acceptedOffers) {
        if (excludeRequestId && row.requestId === excludeRequestId) continue;
        const reqStat = String(row.reqStatus || "").toLowerCase();
        if (reqStat === "cancelled" || reqStat === "canceled") continue;

        const { startsAt: existingStartStr, endsAt: existingEndStr } = resolveRequestTimes({
          createdAt: row.reqCreatedAt,
          data: row.reqData,
        });
        const exStart = new Date(existingStartStr);
        const exEnd = new Date(existingEndStr);

        if (exStart < endTarget && exEnd > startTarget) {
          return { hasConflict: true, reason: "job" };
        }
      }
    }

    // 2. Check private busy blocks. This table stores text IDs, so it accepts
    // both UUID and mock interpreter identifiers.
    const overlappingBusy = await db
      .select()
      .from(busyBlocks)
      .where(
        and(
          inArray(busyBlocks.interpreterId, targetIds),
          lt(busyBlocks.startsAt, endTarget),
          gt(busyBlocks.endsAt, startTarget)
        )
      )
      .limit(1);

    if (overlappingBusy.length > 0) {
      return { hasConflict: true, reason: "busy" };
    }

    return { hasConflict: false };
  } catch (error) {
    console.error("Interpreter conflict lookup failed", { interpreterId: params.interpreterId, error });
    // Fail closed: do not expose a database error or label an uncertain
    // interpreter as available.
    return { hasConflict: true, reason: "job" };
  }
}

export type InterpreterFitStatus =
  | "available"
  | "unavailable"
  | "outside_hours"
  | "not_provided"
  | "not_shared";

/**
 * 6-Tier Classification Algorithm (First match wins):
 * 1. Double-booked -> "unavailable"
 * 2. Private busy -> "unavailable" (Privacy: unified status, never leak busy title or details!)
 * 3. Not shared -> "not_shared" (the interpreter has not switched sharing on for this agency, or never set it)
 * 4. Not provided -> "not_provided" (evaluated in interpreter's profile timezone)
 * 5. Outside hours -> "outside_hours" (evaluated in interpreter's profile timezone)
 * 6. Available -> "available"
 */
export async function checkInterpreterFit(params: {
  interpreterId: string;
  /** Accepted for older callers but ignored: the agency is always the signed-in staff member's own (never the browser's). */
  agencyId?: string;
  jobStartsAtUtc: string | Date;
  jobEndsAtUtc: string | Date;
  jobTimeZone?: string;
}): Promise<{ fit: InterpreterFitStatus }> {
  await requireRole("agency");
  await ensureAvailabilityTables();
  const { interpreterId, jobStartsAtUtc, jobEndsAtUtc } = params;
  // Staff accounts have no agency of their own yet, so the workspace's single agency is used. Always checking it
  // (instead of an optional, browser-supplied id) means the sharing check can never be skipped.
  const agencyId = DEFAULT_AGENCY_ID;

  const targetIds = await resolveInterpreterIds(interpreterId);

  const jobStartsDate = new Date(jobStartsAtUtc);
  const jobEndsDate = new Date(jobEndsAtUtc);

  // --- Tier 1 & 2: Double-booked or Private busy ---
  for (const tid of targetIds) {
    const conflictCheck = await td_conflict({
      interpreterId: tid,
      startsAtUtc: jobStartsDate,
      endsAtUtc: jobEndsDate,
    });
    if (conflictCheck.hasConflict) {
      // Privacy rule: Tier 1 & 2 unify into "unavailable". Never leak title or private details.
      return { fit: "unavailable" };
    }
  }

  // --- Tier 3: Not shared ---
  // Sharing is opt-in: the interpreter must have switched "Share my availability" on for this agency. No saved
  // setting means they never did, so it counts as not shared (same rule as the agency's interpreter detail page).
  const shares = await db
    .select({ enabled: availabilityShares.enabled })
    .from(availabilityShares)
    .where(and(inArray(availabilityShares.interpreterId, targetIds), eq(availabilityShares.agencyId, agencyId)));
  if (!shares.some((share) => share.enabled)) {
    return { fit: "not_shared" };
  }

  // Fetch interpreter's profile timezone across target IDs
  const profiles = await db
    .select()
    .from(interpreterProfiles)
    .where(inArray(interpreterProfiles.interpreterId, targetIds))
    .limit(1);

  const profileZone = getIanaZone(
    profiles[0]?.timeZone || params.jobTimeZone || "America/Los_Angeles"
  );

  // Derive the weekday from the interpreter-local calendar date. Parsing that
  // date at UTC noon makes this a pure Gregorian-date calculation, independent
  // of the server or browser timezone.
  const localStartDateStr = formatInTimeZone(jobStartsDate, profileZone, "yyyy-MM-dd");
  const weekday = new Date(`${localStartDateStr}T12:00:00.000Z`).getUTCDay();

  const startHour = parseInt(formatInTimeZone(jobStartsDate, profileZone, "H"), 10);
  const startMinute = parseInt(formatInTimeZone(jobStartsDate, profileZone, "m"), 10);
  const jobStartMin = startHour * 60 + startMinute;

  const localEndDateStr = formatInTimeZone(jobEndsDate, profileZone, "yyyy-MM-dd");
  const endHour = parseInt(formatInTimeZone(jobEndsDate, profileZone, "H"), 10);
  const endMinute = parseInt(formatInTimeZone(jobEndsDate, profileZone, "m"), 10);
  let jobEndMin = endHour * 60 + endMinute;

  if (localEndDateStr !== localStartDateStr) {
    const sDateOnly = new Date(localStartDateStr + "T00:00:00Z").getTime();
    const eDateOnly = new Date(localEndDateStr + "T00:00:00Z").getTime();
    const dayDiff = Math.max(1, Math.round((eDateOnly - sDateOnly) / 86400000));
    jobEndMin += dayDiff * 1440;
  }

  // Check exceptions first
  const exceptions = await db
    .select()
    .from(availabilityExceptions)
    .where(
      and(
        inArray(availabilityExceptions.interpreterId, targetIds),
        eq(availabilityExceptions.onDate, localStartDateStr)
      )
    );

  if (exceptions.length > 0) {
    const exception = exceptions[0];
    if (!exception.available) {
      return { fit: "outside_hours" };
    }
    if (exception.startMinute != null && exception.endMinute != null) {
      if (exception.startMinute <= jobStartMin && jobEndMin <= exception.endMinute) {
        return { fit: "available" };
      }
      return { fit: "outside_hours" };
    }
    return { fit: "available" };
  }

  // Check weekly rules in profile timezone
  const rules = await db
    .select()
    .from(availabilityRules)
    .where(
      and(
        inArray(availabilityRules.interpreterId, targetIds),
        eq(availabilityRules.weekday, weekday)
      )
    );

  // --- Tier 4: Not provided ---
  if (rules.length === 0) {
    return { fit: "not_provided" };
  }

  // --- Tier 5: Outside hours ---
  const coversJob = rules.some(
    (r) => r.startMinute <= jobStartMin && jobEndMin <= r.endMinute
  );

  if (!coversJob) {
    return { fit: "outside_hours" };
  }

  // --- Tier 6: Available ---
  return { fit: "available" };
}

/**
 * Batch fit evaluation for agency staffing cards.
 */
export async function getInterpretersFitForJob(params: {
  interpreterIds: string[];
  agencyId?: string;
  jobStartsAtUtc: string | Date;
  jobEndsAtUtc: string | Date;
  jobTimeZone?: string;
}): Promise<Record<string, InterpreterFitStatus>> {
  await requireRole("agency");
  const result: Record<string, InterpreterFitStatus> = {};
  for (const interpreterId of params.interpreterIds) {
    try {
      const { fit } = await checkInterpreterFit({
        interpreterId,
        agencyId: params.agencyId,
        jobStartsAtUtc: params.jobStartsAtUtc,
        jobEndsAtUtc: params.jobEndsAtUtc,
        jobTimeZone: params.jobTimeZone,
      });
      result[interpreterId] = fit;
    } catch (error) {
      console.error("Interpreter availability lookup failed", { interpreterId, error });
      result[interpreterId] = "unavailable";
    }
  }
  return result;
}
