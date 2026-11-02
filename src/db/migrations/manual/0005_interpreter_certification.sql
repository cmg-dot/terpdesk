-- Certification text for an interpreter, from the agency's master workbook (the State sheet's Certification column
-- combined with the non-state sheet's Qualifications). Plain text kept as the sheet gave it, e.g. "CDI; NIC Advanced".
-- Applied by hand (not through drizzle-kit's journal), like 0001 to 0004: `drizzle-kit push` also wants to drop the
-- idx_avail_* indexes and rewrite two request_activity foreign keys that exist in the live database but not in schema.ts,
-- so only this additive statement is run. Idempotent. Matches the runtime DDL in ensureAvailabilityTables
-- (src/app/actions/availability.ts).
--
-- NULL until an import or an agency sets it (all existing profiles stay NULL). Agency-only data like the rates: nothing an
-- interpreter's browser receives may select this column.

ALTER TABLE "interpreter_profiles" ADD COLUMN IF NOT EXISTS "certification" text;
