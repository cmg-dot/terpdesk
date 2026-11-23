import { sql } from "drizzle-orm";
import { db } from "@/db";
import { availabilityRules } from "@/db/schema";
import { resolveInterpreterIds } from "@/lib/availability/ids";
import { logError } from "@/lib/logError";

/**
 * Plain server code (not a Server Action), so it is not an endpoint the browser can call.
 */

let tablesEnsured = false;

let ensureInFlight: Promise<void> | null = null;

// Any constant: all instances that run the schema script below take the same lock.
const SCHEMA_LOCK_KEY = 727346101;

/**
 * The tables behind interpreter profiles, availability, credentials and files are created by migration 0010
 * (src/db/migrations/manual/0010_availability_profile_schema.sql), like every other table: the server ASSUMES they exist. This
 * therefore does nothing, so no read (the dashboard, the requests list, the calendar) runs DDL, takes table locks, or pays for 34
 * statements on the first request of a new server instance.
 *
 * For a throwaway database that has not had the migration, set TERPDESK_RUNTIME_DDL=1 and the old behaviour returns: the statements
 * run once per process (callers share one run, under a Postgres advisory lock so two instances never collide).
 */
export async function ensureAvailabilityTables(): Promise<void> {
  if (process.env.TERPDESK_RUNTIME_DDL !== "1") return;
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
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS service_areas TEXT[] NOT NULL DEFAULT '{}'::text[];
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS liability_insurance_expiration DATE;
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS state_rate NUMERIC(8,2);
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS non_state_rate NUMERIC(8,2);
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS king_county_rate NUMERIC(8,2);
      ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS certification TEXT;
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
      ALTER TABLE credentials ADD COLUMN IF NOT EXISTS insurance_kind VARCHAR(30);
      ALTER TABLE credentials ADD COLUMN IF NOT EXISTS coverage_limits VARCHAR(200);

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
      logError("availability seed", seedErr);
    }
  } catch (err) {
    logError("availability tables", err);
  }
}
