-- Intake cancellation engine (phase 15). Applied by hand, like 0001 to 0008 (drizzle-kit push is not used). Additive and idempotent: safe to
-- run twice. NOTHING is dropped or rewritten, and no existing column or row changes.
--
-- ORDER: run this BEFORE deploying the code that names these columns. Drizzle's INSERT names every column of agency_inbox, so a deploy
-- that reaches a database without them would fail to store any incoming email. The old build keeps working with the extra nullable columns.
--
-- agency_inbox: what the app decided about each stored email (all NULL for mail received before this, and for mail it did not recognise)
--   kind          state_request_form | state_in_process | state_cancellation | state_void | hours_report |
--                 requester_cancel_request | requester_reply | other
--   srn           the state request number the email is about
--   outcome       what happened: applied, held for a person, flagged on the job, ignored, no job yet, failed ...
--   processed_at  when the app acted
--   request_id    the job it acted on (no foreign key: a job's removal must never be blocked by a stored email)
--
-- state_srn_events: one row per email that says something about a state request number, keyed by the email's Message-ID so a
-- redelivery changes nothing. It is the memory that lets a cancellation that arrives BEFORE its request form still apply to the job
-- when the form creates it, and the audit trail of what each notice did.
--   occurred_at   the state's own time when the notice states one ("Cancelled On ..."), else when the email was received
--   sender_email  agency-only; kept so a cancellation held for lack of a job can be judged by the same trust rule when the job appears

ALTER TABLE "agency_inbox" ADD COLUMN IF NOT EXISTS "kind" varchar(32);
ALTER TABLE "agency_inbox" ADD COLUMN IF NOT EXISTS "srn" varchar(20);
ALTER TABLE "agency_inbox" ADD COLUMN IF NOT EXISTS "outcome" varchar(32);
ALTER TABLE "agency_inbox" ADD COLUMN IF NOT EXISTS "processed_at" timestamptz;
ALTER TABLE "agency_inbox" ADD COLUMN IF NOT EXISTS "request_id" uuid;

CREATE TABLE IF NOT EXISTS "state_srn_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "srn" varchar(20) NOT NULL,
  "kind" varchar(32) NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "received_at" timestamptz NOT NULL,
  "message_id" text NOT NULL,
  "sender_email" text,
  "authenticated" boolean NOT NULL DEFAULT false,
  "outcome" varchar(32),
  "request_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "state_srn_events_message_id_idx" ON "state_srn_events" ("message_id");
CREATE INDEX IF NOT EXISTS "state_srn_events_srn_idx" ON "state_srn_events" ("srn", "occurred_at");
