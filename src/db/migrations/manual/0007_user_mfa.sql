-- Two-step verification (TOTP authenticator app) for agency logins, opt-in per user from Settings.
-- Applied by hand (not through drizzle-kit's journal), like 0001 to 0006: `drizzle-kit push` also wants to drop the
-- idx_avail_* indexes and rewrite two request_activity foreign keys that exist in the live database but not in schema.ts,
-- so only these additive statements are run. Idempotent (safe to run twice). Two NEW tables: nothing that reads `users` is
-- touched, no existing column is altered, and the app treats a missing table as "two-step verification is not set up".
--
-- Run this BEFORE deploying the code that reads these tables. Also set MFA_ENCRYPTION_KEY in the environment first.
--
-- user_mfa: at most one authenticator per login.
--   secret_enc     the TOTP shared secret, ENCRYPTED by the app (AES-256-GCM, key in MFA_ENCRYPTION_KEY). It has to be
--                  recoverable to check codes, so it cannot be hashed; the database never holds it in plain text.
--   confirmed_at   NULL while enrolment is started but the first code has not been entered: sign-in does NOT ask for a code
--                  until this is set. A person who abandons the QR screen is therefore never locked out.
--   last_used_step the last accepted 30-second time step: a code can be used once (replay guard).
-- user_recovery_codes: one-time codes for a lost phone. Only the SHA-256 hash is stored (the codes are 80 random bits, so a
--   fast hash is safe and lets the app look a code up by its hash, as it does for the other one-time tokens).

CREATE TABLE IF NOT EXISTS "user_mfa" (
  "user_id" uuid PRIMARY KEY REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "method" varchar(16) NOT NULL DEFAULT 'totp' CHECK ("method" IN ('totp')),
  "secret_enc" text NOT NULL,
  "confirmed_at" timestamp,
  "last_used_step" bigint,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "user_recovery_codes_user_hash_unique" UNIQUE ("user_id", "code_hash")
);

CREATE INDEX IF NOT EXISTS "user_recovery_codes_user_idx" ON "user_recovery_codes" ("user_id");

-- ---------------------------------------------------------------------------------------------------------------------
-- NOT run automatically. For a developer or test account that lost its authenticator, or to switch two-step off for one
-- login (replace the email), and to undo this migration entirely:
--
--   DELETE FROM "user_recovery_codes" WHERE "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'someone@example.com');
--   DELETE FROM "user_mfa"            WHERE "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'someone@example.com');
--
--   DROP TABLE IF EXISTS "user_recovery_codes";
--   DROP TABLE IF EXISTS "user_mfa";
-- ---------------------------------------------------------------------------------------------------------------------
