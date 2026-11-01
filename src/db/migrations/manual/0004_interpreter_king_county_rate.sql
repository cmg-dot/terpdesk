-- King County hourly rate: the state roster has two state rates (Standard and King County), so an interpreter can now hold
-- three: state_rate (Standard), king_county_rate and non_state_rate.
-- Applied by hand (not through drizzle-kit's journal), like 0001 to 0003: `drizzle-kit push` also wants to drop the
-- idx_avail_* indexes and rewrite two request_activity foreign keys that exist in the live database but not in schema.ts,
-- so only this additive statement is run. Idempotent. Matches the runtime DDL in ensureAvailabilityTables
-- (src/app/actions/availability.ts).
--
-- numeric(8, 2), same as the other two rates. NULL until an agency sets it (all existing profiles stay NULL). Agency-only
-- data: nothing an interpreter's browser receives may select this column.

ALTER TABLE "interpreter_profiles" ADD COLUMN IF NOT EXISTS "king_county_rate" numeric(8, 2);
