-- Interpreter profile: liability insurance expiration date + service areas as a list of tags.
-- Applied by hand (not through drizzle-kit's journal), like 0001: `drizzle-kit push` also wants to drop the idx_avail_*
-- indexes and rewrite two request_activity foreign keys that exist in the live database but not in schema.ts, so only
-- these additive statements are run. Idempotent. The columns live on interpreter_profiles (not interpreters, which holds
-- only name / email / phone); they match the runtime DDL in ensureAvailabilityTables (src/app/actions/availability.ts).
--
-- service_areas is NOT NULL DEFAULT '{}': existing rows get an empty list (no rewrite of the old free-text service_area,
-- which stays as the one-line summary the website profile reads). liability_insurance_expiration is NULL until recorded.

ALTER TABLE "interpreter_profiles" ADD COLUMN IF NOT EXISTS "service_areas" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE "interpreter_profiles" ADD COLUMN IF NOT EXISTS "liability_insurance_expiration" date;
