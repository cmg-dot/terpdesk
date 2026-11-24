import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { interpreters } from "@/db/schema";

/**
 * An interpreter's own glossary (migrations/manual/0015_glossary.sql). Kept out of schema.ts on purpose, like personalJobsSchema.ts: only the
 * Prep glossary reads it, so a database without the migration is untouched by every other page. The same-entry rule is a unique index
 * on lower(term) and lower(rendering) in the SQL (an expression index is not described here); a duplicate insert is Postgres code 23505.
 */
export const interpreterGlossaryTerms = pgTable("interpreter_glossary_terms", {
  id: uuid("id").defaultRandom().primaryKey(),
  interpreterId: uuid("interpreter_id").notNull().references(() => interpreters.id, { onDelete: "cascade" }),
  term: varchar("term", { length: 200 }).notNull(),
  rendering: varchar("rendering", { length: 300 }).notNull(),
  sourceLang: varchar("source_lang", { length: 40 }).notNull().default("English"),
  targetLang: varchar("target_lang", { length: 40 }).notNull().default("ASL"),
  setting: varchar("setting", { length: 40 }),
  note: varchar("note", { length: 300 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  interpreterSettingIdx: index("interpreter_glossary_terms_interpreter_setting_idx").on(t.interpreterId, t.setting),
}));

export type SelectGlossaryTerm = typeof interpreterGlossaryTerms.$inferSelect;
