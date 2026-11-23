import { boolean, index, numeric, pgTable, smallint, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { interpreters } from "@/db/schema";

/**
 * Jobs an interpreter does on their own, outside any agency (migrations/manual/0014_personal_jobs.sql). Kept out of schema.ts on
 * purpose, like billingSchema.ts: only /my-work and the conflict check read it, so a database without the migration is untouched by
 * every other page, and the conflict check treats a missing table as "no personal jobs".
 */
export const interpreterPersonalJobs = pgTable("interpreter_personal_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  interpreterId: uuid("interpreter_id").notNull().references(() => interpreters.id, { onDelete: "cascade" }),
  // Optional and private to the interpreter: never in the audit log, email or an agency view.
  label: varchar("label", { length: 80 }),
  setting: varchar("setting", { length: 40 }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timeZone: text("time_zone").notNull().default("America/Los_Angeles"),
  breakMinutes: smallint("break_minutes").notNull().default(0),
  // numeric comes back as text; lib/personalJobs.ts turns it into numbers.
  miles: numeric("miles", { precision: 7, scale: 1 }),
  roundTrip: boolean("round_trip").notNull().default(false),
  countedMiles: numeric("counted_miles", { precision: 7, scale: 1 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  interpreterStartIdx: index("interpreter_personal_jobs_interpreter_start_idx").on(t.interpreterId, t.startsAt),
}));

export type SelectPersonalJob = typeof interpreterPersonalJobs.$inferSelect;
