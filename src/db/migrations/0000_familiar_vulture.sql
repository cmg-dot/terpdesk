CREATE TYPE "public"."billing_status" AS ENUM('completed', 'cancelled_billable', 'cancelled_not_billable');--> statement-breakpoint
CREATE TABLE "interpreters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "interpreters_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"interpreter_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"data" jsonb DEFAULT '{"brief":{},"intake":{}}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"canceled_at" timestamp,
	"cancel_reason" text,
	"travel_start_time" timestamp,
	"travel_end_time" timestamp,
	"service_completed" boolean,
	"cancellation_reason" text,
	"billing_status" "billing_status"
);
--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_interpreter_id_interpreters_id_fk" FOREIGN KEY ("interpreter_id") REFERENCES "public"."interpreters"("id") ON DELETE no action ON UPDATE no action;