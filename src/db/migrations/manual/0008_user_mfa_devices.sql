-- Several authenticator devices per login (phase 11.5). Applied by hand, like 0001 to 0007 (drizzle-kit push is not used: it also wants
-- to drop the idx_avail_* indexes). Additive and idempotent: safe to run twice. ONE new table; `users` and `user_recovery_codes` are
-- not touched, and the old `user_mfa` table is left exactly as it is.
--
-- ORDER: run this BEFORE deploying the code that reads user_mfa_devices (the new sign-in reads ONLY this table; if it does not exist,
-- agency sign-ins are refused, because the app cannot tell whether a code is owed). Then run the INSERT ... SELECT below a second time
-- right after the deploy, to pick up anything enrolled through the old build while it was still live. The new code also removes the
-- matching old user_mfa row when a person turns two-step off, so re-running the backfill can never bring back a login that was switched off.
--
-- user_mfa_devices: the single source of truth. Two-step verification is ON for a login if and only if it has at least one
-- row here with confirmed_at set.
--   label           the person's own name for the device ("Work phone"), shown in Settings
--   secret_enc      the TOTP secret, AES-256-GCM sealed by the app (same format as user_mfa.secret_enc, bound to user_id), so
--                   the sealed values are copied across unchanged by the backfill
--   confirmed_at    NULL while enrolment is started but the first code has not been entered: sign-in never asks for it
--   last_used_step  replay guard, now PER DEVICE (every device has its own secret and its own 30-second counter)
--   last_used_at    when this device last signed someone in (or re-confirmed a change); NULL = never used since it was added
-- At most 5 confirmed devices per login is enforced by the app (inside a transaction that locks the user's row).

CREATE TABLE IF NOT EXISTS "user_mfa_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "label" varchar(100) NOT NULL DEFAULT 'Primary authenticator',
  "method" varchar(16) NOT NULL DEFAULT 'totp' CHECK ("method" IN ('totp')),
  "secret_enc" text NOT NULL,
  "confirmed_at" timestamp,
  "last_used_step" bigint,
  "last_used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Sign-in and Settings look devices up by login.
CREATE INDEX IF NOT EXISTS "user_mfa_devices_user_idx" ON "user_mfa_devices" ("user_id");

-- At most ONE unfinished enrolment per login (a second "Add a device" replaces the first instead of piling up rows).
CREATE UNIQUE INDEX IF NOT EXISTS "user_mfa_devices_one_pending_idx" ON "user_mfa_devices" ("user_id") WHERE "confirmed_at" IS NULL;

-- Backfill: every existing authenticator becomes that login's first device, named "Primary authenticator". Skips any login that
-- already has a row in the new table, so it is safe to run again. last_used_at is only set when a code was accepted AFTER the device
-- was confirmed (user_mfa.updated_at moves on every accepted code), so a device that was set up but never used to sign in stays "Never".
INSERT INTO "user_mfa_devices" ("user_id", "label", "method", "secret_enc", "confirmed_at", "last_used_step", "last_used_at", "created_at", "updated_at")
SELECT m."user_id",
       'Primary authenticator',
       m."method",
       m."secret_enc",
       m."confirmed_at",
       m."last_used_step",
       CASE WHEN m."confirmed_at" IS NOT NULL AND m."updated_at" > m."confirmed_at" + interval '5 seconds' THEN m."updated_at" END,
       m."created_at",
       m."updated_at"
FROM "user_mfa" m
WHERE NOT EXISTS (SELECT 1 FROM "user_mfa_devices" d WHERE d."user_id" = m."user_id");

-- ---------------------------------------------------------------------------------------------------------------------
-- NOT run automatically.
--
-- Check the result (every old row should have a device; the counts should match):
--   SELECT (SELECT count(*) FROM "user_mfa") AS old_rows, (SELECT count(*) FROM "user_mfa_devices") AS device_rows;
--
-- Switch two-step off for one login (replace the email), e.g. a test account that lost its phone:
--   DELETE FROM "user_recovery_codes" WHERE "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'someone@example.com');
--   DELETE FROM "user_mfa_devices"    WHERE "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'someone@example.com');
--   DELETE FROM "user_mfa"            WHERE "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'someone@example.com');
--
-- Undo this migration (the old user_mfa table still holds the first device of every login, but anything added since is lost):
--   DROP TABLE IF EXISTS "user_mfa_devices";
-- ---------------------------------------------------------------------------------------------------------------------
