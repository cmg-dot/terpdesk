import { boolean, date, index, numeric, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { credentials, interpreters } from "@/db/schema";

/**
 * An interpreter's private renewal cycles and CEU log (migrations/manual/0017_ceu_tracker.sql). Kept out of schema.ts on purpose, like
 * glossarySchema.ts: only the CEUs & renewals tab reads it, so a database without the migration is untouched by every other page.
 * Dates are plain calendar dates (yyyy-MM-dd text); amounts are numeric(6,2) and arrive as text ("0.30").
 */
export const renewalCycles = pgTable("renewal_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  interpreterId: uuid("interpreter_id").notNull().references(() => interpreters.id, { onDelete: "cascade" }),
  credentialId: uuid("credential_id").references(() => credentials.id, { onDelete: "set null" }),
  label: varchar("label", { length: 120 }).notNull(),
  cycleStart: date("cycle_start", { mode: "string" }).notNull(),
  cycleEnd: date("cycle_end", { mode: "string" }).notNull(),
  unit: varchar("unit", { length: 8, enum: ["ceu", "hours"] }).notNull(),
  requiredTotal: numeric("required_total", { precision: 6, scale: 2 }),
  requiredEthics: numeric("required_ethics", { precision: 6, scale: 2 }),
  requiredPpo: numeric("required_ppo", { precision: 6, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  interpreterEndIdx: index("renewal_cycles_interpreter_end_idx").on(t.interpreterId, t.cycleEnd),
}));

export const ceuEntries = pgTable("ceu_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  interpreterId: uuid("interpreter_id").notNull().references(() => interpreters.id, { onDelete: "cascade" }),
  cycleId: uuid("cycle_id").references(() => renewalCycles.id, { onDelete: "set null" }),
  earnedOn: date("earned_on", { mode: "string" }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  provider: varchar("provider", { length: 120 }),
  category: varchar("category", { length: 40 }).notNull(),
  amount: numeric("amount", { precision: 6, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 8, enum: ["ceu", "hours"] }).notNull(),
  isEthics: boolean("is_ethics").notNull().default(false),
  isPpo: boolean("is_ppo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  interpreterEarnedIdx: index("ceu_entries_interpreter_earned_idx").on(t.interpreterId, t.earnedOn),
  cycleIdx: index("ceu_entries_cycle_idx").on(t.cycleId),
}));

export type SelectRenewalCycle = typeof renewalCycles.$inferSelect;
export type SelectCeuEntry = typeof ceuEntries.$inferSelect;
