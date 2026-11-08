-- Per-login display preferences: today only the workspace theme chosen in Settings → Appearance.
-- Applied by hand (not through drizzle-kit's journal), like 0001 to 0005: `drizzle-kit push` also wants to drop the
-- idx_avail_* indexes and rewrite two request_activity foreign keys that exist in the live database but not in schema.ts,
-- so only this additive statement is run. Idempotent. A new table, so nothing that reads `users` is affected, and the app
-- falls back to the default theme if the table is missing.

CREATE TABLE IF NOT EXISTS "user_preferences" (
  "user_id" uuid PRIMARY KEY REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "theme" varchar(32) NOT NULL DEFAULT 'default',
  "updated_at" timestamp NOT NULL DEFAULT now()
);
