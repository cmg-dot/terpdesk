-- Session revocation after a password reset or change (Phase 19.3). Applied by hand like 0006 to 0010, to production and
-- terpdesk_demo. Idempotent and additive: a new table, so nothing that reads `users` is affected. The sign-in check
-- (src/lib/auth/sessionRevocation.ts) treats a missing row, or a missing table, as "nothing revoked".
--
-- sessions_valid_after: a sign-in token issued before this moment is refused.
-- kept_session_id:      the one session exempt from that (the session that changed its own password); NULL after a reset.

CREATE TABLE IF NOT EXISTS "user_security" (
  "user_id" uuid PRIMARY KEY REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "sessions_valid_after" timestamptz NOT NULL,
  "kept_session_id" text
);
