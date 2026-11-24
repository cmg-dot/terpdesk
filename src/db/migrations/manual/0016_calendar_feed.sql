-- Standalone Interpreter toolkit, slice C (the private calendar feed). Applied by hand like 0006 to 0015: to terpdesk_demo first, and to
-- production only when asked. Idempotent and additive: ONE NEW table and one index, no change to any existing table, so code that predates
-- it, and a database without it, keep working (the feed endpoint answers its ordinary 404, the Calendar page says it is not set up yet).
--
-- interpreter_calendar_feeds   one private, revocable subscription address (an .ics feed) per interpreter.
--   token_hash       SHA-256 (hex) of the secret in the address. The secret itself is shown once, when the address is made or rotated, and is
--                    never stored, logged or audited (security.md 3). There is NO expiry: a calendar app polls for years and an expiry would
--                    silently end the subscription, so the address is revocable and rotatable instead (documented in security.md 3).
--   detail_level     'busy' (default): titles are only "terpDESK job", "Personal job" and "Busy". 'generic' adds one generic setting category
--                    (Medical, Legal, ...), never the form's own words. Never a client, an organization, an address or a private label.
--   created_at / rotated_at / revoked_at   revoked_at set = the address answers 404 from then on.
--   last_fetched_at  when a calendar app last got the feed (shown to the interpreter as "Last synced").
--   window_started_at, window_count   a per-address rate limit counted here (about 60 fetches an hour), updated in ONE statement so two
--                    simultaneous fetches cannot both slip under it. A serverless host has no memory to count in.
-- A revoked row is kept (for the audit trail of when) but only one ACTIVE row per interpreter may exist.

CREATE TABLE IF NOT EXISTS interpreter_calendar_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interpreter_id uuid NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  detail_level varchar(10) NOT NULL DEFAULT 'busy' CHECK (detail_level IN ('busy', 'generic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  revoked_at timestamptz,
  last_fetched_at timestamptz,
  window_started_at timestamptz,
  window_count integer NOT NULL DEFAULT 0 CHECK (window_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS interpreter_calendar_feeds_one_active_idx
  ON interpreter_calendar_feeds (interpreter_id) WHERE revoked_at IS NULL;
