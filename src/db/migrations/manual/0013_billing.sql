-- Phase 6 billing. Applied by hand like 0006 to 0012: to terpdesk_demo first, and to production only once Kari and Josie have
-- signed off on /billing. Idempotent and additive: four NEW tables and no change to any existing table, so code that predates it,
-- and production without it, keep working. Only /billing (src/lib/billing/store.ts) reads these tables.
--
-- agency_billing_settings     one row per agency: mileage rate, vendor and onsite fees, the default Non-state client rate, the
--                             rounding steps, the business day the cancellation notice is counted in, and an optional evening
--                             window for travel time (both minutes NULL = no evening split).
-- agency_pay_periods          the semi-monthly pay schedule: each period's service dates, its invoice cutoff (noon Pacific) and pay
--                             date. Edited on /billing > Rates & rules.
-- agency_holidays             days that are not business days for the cancellation notice (WA state legal holidays, observed).
-- agency_interpreter_billing  per-interpreter extras the rate card (interpreter_profiles) does not hold: the evening travel rate.

CREATE TABLE IF NOT EXISTS agency_billing_settings (
  agency_id text PRIMARY KEY,
  mileage_rate numeric(6,3) NOT NULL DEFAULT 0.760 CHECK (mileage_rate >= 0),
  vendor_fee numeric(8,2) NOT NULL DEFAULT 75.00 CHECK (vendor_fee >= 0),
  onsite_fee numeric(8,2) NOT NULL DEFAULT 10.00 CHECK (onsite_fee >= 0),
  default_client_rate numeric(8,2) NOT NULL DEFAULT 95.00 CHECK (default_client_rate >= 0),
  non_state_rounding_minutes smallint NOT NULL DEFAULT 30 CHECK (non_state_rounding_minutes IN (15, 30)),
  state_rounding_minutes smallint NOT NULL DEFAULT 15 CHECK (state_rounding_minutes IN (1, 15, 30)),
  business_day_start_minute smallint NOT NULL DEFAULT 480,
  business_day_end_minute smallint NOT NULL DEFAULT 1020,
  cancel_notice_business_days smallint NOT NULL DEFAULT 2 CHECK (cancel_notice_business_days BETWEEN 0 AND 30),
  evening_start_minute smallint CHECK (evening_start_minute BETWEEN 0 AND 1439),
  evening_end_minute smallint CHECK (evening_end_minute BETWEEN 0 AND 1439),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CHECK (business_day_start_minute >= 0 AND business_day_end_minute <= 1440 AND business_day_start_minute < business_day_end_minute)
);
INSERT INTO agency_billing_settings (agency_id) VALUES ('agency-1') ON CONFLICT (agency_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS agency_pay_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  cutoff_at timestamptz,
  pay_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_start <= period_end)
);
CREATE UNIQUE INDEX IF NOT EXISTS agency_pay_periods_agency_start_idx ON agency_pay_periods (agency_id, period_start);

CREATE TABLE IF NOT EXISTS agency_holidays (
  agency_id text NOT NULL,
  holiday_date date NOT NULL,
  label varchar(100) NOT NULL,
  PRIMARY KEY (agency_id, holiday_date)
);
-- WA state legal holidays (RCW 1.16.050) on the day they are observed: Saturday -> the Friday before, Sunday -> the Monday after.
-- tests/billing/holidays.test.ts checks this list against src/lib/billing/holidays.ts.
INSERT INTO agency_holidays (agency_id, holiday_date, label) VALUES
  ('agency-1', '2026-01-01', 'New Year''s Day'),
  ('agency-1', '2026-01-19', 'Martin Luther King Jr. Day'),
  ('agency-1', '2026-02-16', 'Presidents'' Day'),
  ('agency-1', '2026-05-25', 'Memorial Day'),
  ('agency-1', '2026-06-19', 'Juneteenth'),
  ('agency-1', '2026-07-03', 'Independence Day (observed)'),
  ('agency-1', '2026-09-07', 'Labor Day'),
  ('agency-1', '2026-11-11', 'Veterans Day'),
  ('agency-1', '2026-11-26', 'Thanksgiving Day'),
  ('agency-1', '2026-11-27', 'Native American Heritage Day'),
  ('agency-1', '2026-12-25', 'Christmas Day'),
  ('agency-1', '2027-01-01', 'New Year''s Day'),
  ('agency-1', '2027-01-18', 'Martin Luther King Jr. Day'),
  ('agency-1', '2027-02-15', 'Presidents'' Day'),
  ('agency-1', '2027-05-31', 'Memorial Day'),
  ('agency-1', '2027-06-18', 'Juneteenth (observed)'),
  ('agency-1', '2027-07-05', 'Independence Day (observed)'),
  ('agency-1', '2027-09-06', 'Labor Day'),
  ('agency-1', '2027-11-11', 'Veterans Day'),
  ('agency-1', '2027-11-25', 'Thanksgiving Day'),
  ('agency-1', '2027-11-26', 'Native American Heritage Day'),
  ('agency-1', '2027-12-24', 'Christmas Day (observed)'),
  ('agency-1', '2027-12-31', 'New Year''s Day (observed)')
ON CONFLICT (agency_id, holiday_date) DO NOTHING;

CREATE TABLE IF NOT EXISTS agency_interpreter_billing (
  agency_id text NOT NULL,
  interpreter_id uuid NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
  evening_rate numeric(8,2) CHECK (evening_rate >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, interpreter_id)
);
