-- Mileage: per-leg table + the agency's reason when the approved mileage differs from the reported mileage.
-- Applied by hand (not through drizzle-kit's journal): `drizzle-kit push` also wanted to drop the idx_avail_* indexes and
-- rewrite two request_activity foreign keys that exist in the live database but not in schema.ts, so only these
-- additive statements were run. Idempotent; constraint and index names match what drizzle-kit would generate.

ALTER TABLE "timesheets" ADD COLUMN IF NOT EXISTS "mileage_adjustment_reason" text;

CREATE TABLE IF NOT EXISTS "mileage_legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"interpreter_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"from_label" text DEFAULT '' NOT NULL,
	"to_label" text DEFAULT '' NOT NULL,
	"miles" numeric(7, 1) NOT NULL,
	"round_trip" boolean DEFAULT false NOT NULL,
	"counted_miles" numeric(7, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mileage_legs_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "mileage_legs_interpreter_id_interpreters_id_fk" FOREIGN KEY ("interpreter_id") REFERENCES "public"."interpreters"("id") ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "mileage_legs_owner_position_idx" ON "mileage_legs" USING btree ("request_id","interpreter_id","position");
CREATE INDEX IF NOT EXISTS "mileage_legs_interpreter_idx" ON "mileage_legs" USING btree ("interpreter_id");
