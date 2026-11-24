import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { interpreterCalendarFeeds as feeds } from "@/db/calendarFeedSchema";
import type { SelectCalendarFeed } from "@/db/calendarFeedSchema";
import type { FeedDetailLevel } from "@/lib/calendarFeed/events";

/**
 * The feed rows. Plain server code (not a Server Action). Every function that changes a row is scoped by the interpreter id its CALLER
 * took from the session, or by the token's hash (the endpoint). The secret is never here: only its hash.
 */

/** About 60 fetches an hour per address. Calendar apps poll every 15 minutes to a few hours, so a real subscription is far below this. */
export const FEED_FETCH_LIMIT = 60;
export const FEED_WINDOW_MS = 60 * 60 * 1000;

const active = (interpreterId: string) => and(eq(feeds.interpreterId, interpreterId), isNull(feeds.revokedAt));

export async function findActiveFeed(interpreterId: string): Promise<SelectCalendarFeed | null> {
  const [row] = await db.select().from(feeds).where(active(interpreterId)).limit(1);
  return row ?? null;
}

export async function insertFeed(interpreterId: string, tokenHash: string, level: FeedDetailLevel): Promise<SelectCalendarFeed | null> {
  const [row] = await db.insert(feeds).values({ interpreterId, tokenHash, detailLevel: level }).returning();
  return row ?? null;
}

/** A new secret for the active feed: the old address stops working at once, and the counters and "last synced" start over. */
export async function rotateActiveFeed(interpreterId: string, tokenHash: string): Promise<SelectCalendarFeed | null> {
  const [row] = await db
    .update(feeds)
    .set({ tokenHash, rotatedAt: new Date(), lastFetchedAt: null, windowStartedAt: null, windowCount: 0 })
    .where(active(interpreterId))
    .returning();
  return row ?? null;
}

/** Ends the active feed. The row is kept (revoked_at is when); the address answers 404 from now on. Null when there was none. */
export async function revokeActiveFeed(interpreterId: string): Promise<SelectCalendarFeed | null> {
  const [row] = await db.update(feeds).set({ revokedAt: new Date() }).where(active(interpreterId)).returning();
  return row ?? null;
}

export async function setActiveFeedDetail(interpreterId: string, level: FeedDetailLevel): Promise<SelectCalendarFeed | null> {
  const [row] = await db.update(feeds).set({ detailLevel: level }).where(active(interpreterId)).returning();
  return row ?? null;
}

export type FeedTouch =
  | { kind: "unknown" }
  | { kind: "limited"; retryAfterSeconds: number }
  | { kind: "ok"; interpreterId: string; level: FeedDetailLevel };

/**
 * One fetch of the feed by its secret's hash, counted and answered in ONE statement, so two simultaneous fetches cannot both slip under
 * the limit: the window restarts when an hour has passed, otherwise the count goes up by one, and "last synced" moves only for a fetch
 * that is allowed. A revoked or unknown hash matches no row ("unknown"). `windowStartedAt` and `windowCount` come back as the new values.
 */
export async function touchFeed(tokenHash: string, now: Date = new Date()): Promise<FeedTouch> {
  const stale = sql`(${feeds.windowStartedAt} is null or ${feeds.windowStartedAt} <= now() - interval '1 hour')`;
  const nextCount = sql`(case when ${stale} then 1 else ${feeds.windowCount} + 1 end)`;
  const [row] = await db
    .update(feeds)
    .set({
      windowStartedAt: sql`case when ${stale} then now() else ${feeds.windowStartedAt} end`,
      windowCount: sql`${nextCount}`,
      lastFetchedAt: sql`case when ${nextCount} <= ${FEED_FETCH_LIMIT} then now() else ${feeds.lastFetchedAt} end`,
    })
    .where(and(eq(feeds.tokenHash, tokenHash), isNull(feeds.revokedAt)))
    .returning({ interpreterId: feeds.interpreterId, level: feeds.detailLevel, windowStartedAt: feeds.windowStartedAt, windowCount: feeds.windowCount });
  if (!row) return { kind: "unknown" };
  if (row.windowCount > FEED_FETCH_LIMIT) {
    const reset = (row.windowStartedAt?.getTime() ?? now.getTime()) + FEED_WINDOW_MS;
    // Never more than the window itself (the database's clock and this server's can differ by a few seconds).
    return { kind: "limited", retryAfterSeconds: Math.min(FEED_WINDOW_MS / 1000, Math.max(1, Math.ceil((reset - now.getTime()) / 1000))) };
  }
  return { kind: "ok", interpreterId: row.interpreterId, level: row.level };
}
