-- Standalone Interpreter toolkit, slice E (CEUs & renewals on /profile). Applied by hand like 0006 to 0016: to terpdesk_demo first, and to
-- production only when asked. Idempotent and additive: TWO NEW tables and their indexes, no change to any existing table (credentials is
-- untouched), so code that predates it, and a database without it, keep working (the tab says "not set up yet" and /profile loads as before).
--
-- Private to the interpreter: no agency view, email, audit row or calendar title ever carries a cycle label, a CEU title or a provider.
--
-- renewal_cycles   one renewal period an interpreter tracks (for example a certification cycle or a state renewal)
--   credential_id  optional link to one of their credentials; SET NULL when that credential is deleted (the cycle is theirs, not the credential's)
--   unit           'ceu' or 'hours': the certifying body's unit, never converted
--   required_*     optional targets (total, ethics, power-privilege-oppression); NULL = not tracked
-- ceu_entries      one training or credit earned
--   cycle_id       optional; SET NULL when the cycle is deleted (the log is kept)
--   amount         in the unit of the cycle (or its own unit when it has no cycle)

CREATE TABLE IF NOT EXISTS renewal_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interpreter_id uuid NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
  credential_id uuid REFERENCES credentials(id) ON DELETE SET NULL,
  label varchar(120) NOT NULL CHECK (length(btrim(label)) > 0),
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  unit varchar(8) NOT NULL CHECK (unit IN ('ceu', 'hours')),
  required_total numeric(6,2) CHECK (required_total IS NULL OR required_total > 0),
  required_ethics numeric(6,2) CHECK (required_ethics IS NULL OR required_ethics > 0),
  required_ppo numeric(6,2) CHECK (required_ppo IS NULL OR required_ppo > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cycle_end > cycle_start)
);

CREATE INDEX IF NOT EXISTS renewal_cycles_interpreter_end_idx ON renewal_cycles (interpreter_id, cycle_end);

CREATE TABLE IF NOT EXISTS ceu_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interpreter_id uuid NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES renewal_cycles(id) ON DELETE SET NULL,
  earned_on date NOT NULL,
  title varchar(120) NOT NULL CHECK (length(btrim(title)) > 0),
  provider varchar(120),
  category varchar(40) NOT NULL,
  amount numeric(6,2) NOT NULL CHECK (amount > 0),
  unit varchar(8) NOT NULL CHECK (unit IN ('ceu', 'hours')),
  is_ethics boolean NOT NULL DEFAULT false,
  is_ppo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ceu_entries_interpreter_earned_idx ON ceu_entries (interpreter_id, earned_on DESC);
CREATE INDEX IF NOT EXISTS ceu_entries_cycle_idx ON ceu_entries (cycle_id);
