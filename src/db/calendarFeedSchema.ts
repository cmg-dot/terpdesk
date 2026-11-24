import { integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { interpreters } from "@/db/schema";

/**
 * An interpreter's private calendar subscription (migrations/manual/0016_calendar_feed.sql). Kept out of schema.ts on purpose, like
 * personalJobsSchema.ts and glossarySchema.ts: only the feed endpoint and the Calendar page's subscription card read it, so a database
 * without the migration is untouched by every other page. Only the SHA-256 of the secret is stored. The one-active-feed rule is a partial
 * unique index in the SQL (not described here); a second active insert is Postgres code 23505.
 */
export const interpreterCalendarFeeds = pgTable("interpreter_calendar_feeds", {
  id: uuid("id").defaultRandom().primaryKey(),
  interpreterId: uuid("interpreter_id").notNull().references(() => interpreters.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  detailLevel: varchar("detail_level", { length: 10, enum: ["busy", "generic"] }).notNull().default("busy"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }),
  windowCount: integer("window_count").notNull().default(0),
});

export type SelectCalendarFeed = typeof interpreterCalendarFeeds.$inferSelect;
