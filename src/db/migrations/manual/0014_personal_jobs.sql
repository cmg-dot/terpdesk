-- Standalone Interpreter Mode, slice B. Applied by hand like 0006 to 0013: to terpdesk_demo first, and to production only when asked.
-- Idempotent and additive: ONE NEW table and one index, no change to any existing table, so code that predates it, and a database without
-- it, keep working (the conflict check treats a missing table as "no personal jobs", see src/lib/availability/personalJobConflict.ts).
--
-- interpreter_personal_jobs   jobs an interpreter does on their own, outside any agency: when, where in broad terms, how long, how far.
--   label          optional, 80 characters. The form says "No client names". Never written to the audit log, email or any agency view.
--   setting        optional, one of the request forms' settings (src/lib/requestOptions.ts FILTER_SETTINGS), validated by the server.
--   starts_at /
--   ends_at        the job's window, UTC. ends_at must be after starts_at.
--   time_zone      the zone the interpreter entered the times in (an IANA id), so the CSV and the list show the same wall-clock time.
--   break_minutes  unpaid break inside the window; hours worked = window minus break (derived, not stored).
--   miles          one-way miles as entered; round_trip doubles them; counted_miles is the server's figure (miles x 2 for a round trip).
-- No rates, earnings, payer or free-text notes, on purpose.

CREATE TABLE IF NOT EXISTS interpreter_personal_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interpreter_id uuid NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
  label varchar(80),
  setting varchar(40),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  time_zone text NOT NULL DEFAULT 'America/Los_Angeles',
  break_minutes smallint NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 480),
  miles numeric(7,1) CHECK (miles >= 0),
  round_trip boolean NOT NULL DEFAULT false,
  counted_miles numeric(7,1) CHECK (counted_miles >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS interpreter_personal_jobs_interpreter_start_idx
  ON interpreter_personal_jobs (interpreter_id, starts_at);
