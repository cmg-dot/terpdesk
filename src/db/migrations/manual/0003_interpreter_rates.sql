-- Interpreter rate profile: the hourly State and Non-state rates an agency sets for an interpreter.
-- Applied by hand (not through drizzle-kit's journal), like 0001 and 0002: `drizzle-kit push` also wants to drop the
-- idx_avail_* indexes and rewrite two request_activity foreign keys that exist in the live database but not in schema.ts,
-- so only these additive statements are run. Idempotent. They match the runtime DDL in ensureAvailabilityTables
-- (src/app/actions/availability.ts).
--
-- numeric(8, 2) = up to 999,999.99 dollars per hour, always two decimals. NULL until an agency sets it (all existing
-- profiles stay NULL). Agency-only data: nothing an interpreter's browser receives may select these columns.

ALTER TABLE "interpreter_profiles" ADD COLUMN IF NOT EXISTS "state_rate" numeric(8, 2);
ALTER TABLE "interpreter_profiles" ADD COLUMN IF NOT EXISTS "non_state_rate" numeric(8, 2);
