-- Interpreter profiles, availability, credentials and files. Applied by hand, like 0001 to 0009 (drizzle-kit push is not used).
-- Additive and idempotent: safe to run twice, on a database that has none of it, some of it or all of it. NOTHING is dropped or rewritten.
--
-- Until now the app ran exactly these statements itself: ensureAvailabilityTables() was called at the top of about 75 server actions (the
-- dashboard, the requests list and the calendar among them), so the first request on every new server instance ran 34 DDL statements
-- (taking table locks) before it could read anything. That is no longer done: the server assumes this file has been applied.
--
-- ORDER: run this BEFORE deploying the code that stops creating these objects, on every database the app points at (production,
-- previews, a new developer's database). The production database already holds every object below (checked column by column).
-- For a throwaway local database the old behaviour is still available: set TERPDESK_RUNTIME_DDL=1 and the app creates them itself.
--
-- The statements below are the ones the app used to run, unchanged.

CREATE TABLE IF NOT EXISTS interpreter_profiles (
  id TEXT PRIMARY KEY,
  interpreter_id TEXT NOT NULL,
  time_zone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS availability_rules (
  id TEXT PRIMARY KEY,
  interpreter_id TEXT NOT NULL,
  weekday SMALLINT NOT NULL,
  start_minute INTEGER NOT NULL,
  end_minute INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id TEXT PRIMARY KEY,
  interpreter_id TEXT NOT NULL,
  on_date TEXT NOT NULL,
  available BOOLEAN NOT NULL DEFAULT false,
  start_minute INTEGER,
  end_minute INTEGER
);

CREATE TABLE IF NOT EXISTS busy_blocks (
  id TEXT PRIMARY KEY,
  interpreter_id TEXT NOT NULL,
  title TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  time_zone TEXT,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS availability_shares (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  interpreter_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE availability_shares ADD COLUMN IF NOT EXISTS allows_auto_book BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS preferred_name VARCHAR(80);
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500);
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS short_bio TEXT;
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS state_or_region VARCHAR(100);
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS service_area VARCHAR(200);
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS service_areas TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS liability_insurance_expiration DATE;
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS state_rate NUMERIC(8,2);
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS non_state_rate NUMERIC(8,2);
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS king_county_rate NUMERIC(8,2);
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS certification TEXT;
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS takes_in_person BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS takes_virtual BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS work_email VARCHAR(255);
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS work_phone VARCHAR(30);
ALTER TABLE interpreter_profiles ADD COLUMN IF NOT EXISTS contact_visibility VARCHAR(10) NOT NULL DEFAULT 'private';

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interpreter_id UUID NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(20) NOT NULL,
  issued_by VARCHAR(150),
  credential_number VARCHAR(100),
  issue_date DATE,
  expiration_date DATE,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS credentials_interpreter_idx ON credentials (interpreter_id);
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS credential_agency_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  agency_id TEXT NOT NULL,
  include_files BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS credential_agency_shares_credential_agency_idx
  ON credential_agency_shares (credential_id, agency_id);

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  file_name VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by_agency_id TEXT,
  uploaded_by_interpreter_id UUID REFERENCES interpreters(id) ON DELETE SET NULL,
  linked_job_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  linked_credential_id UUID REFERENCES credentials(id) ON DELETE CASCADE,
  shared_with_interpreters BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS files_linked_job_idx ON files (linked_job_id);

CREATE INDEX IF NOT EXISTS idx_avail_rules_interp ON availability_rules (interpreter_id);
CREATE INDEX IF NOT EXISTS idx_avail_exceptions_interp ON availability_exceptions (interpreter_id);
CREATE INDEX IF NOT EXISTS idx_busy_blocks_interp ON busy_blocks (interpreter_id);
CREATE INDEX IF NOT EXISTS idx_avail_shares_interp ON availability_shares (interpreter_id);
