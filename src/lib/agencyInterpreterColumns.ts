import { sql } from "drizzle-orm";
import { db } from "@/db";
import { logError } from "@/lib/logError";

let ensured = false;

/**
 * Runtime fallback for databases that `drizzle-kit push` has not reached: adds the newer agency_interpreters
 * columns if they are missing. Drizzle inserts name every column, so this must run before inserting a row.
 * Kept separate from ensureAvailabilityTables so a missing agency_interpreters table cannot break availability.
 *
 * SERVER ONLY: runs DDL. Never throws; a failure is logged and retried on the next call.
 */
export async function ensureAgencyInterpreterColumns(): Promise<void> {
  if (ensured) return;
  try {
    await db.execute(sql`
      ALTER TABLE agency_interpreters ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE agency_interpreters ADD COLUMN IF NOT EXISTS website_permission_status VARCHAR(20) NOT NULL DEFAULT 'not_shared';
    `);
    ensured = true;
  } catch (err) {
    logError("ensureAgencyInterpreterColumns", err);
  }
}
