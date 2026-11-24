"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { isMissingTable } from "@/lib/availability/personalJobConflict";
import { getBaseUrl } from "@/lib/baseUrl";
import { isFeedDetailLevel } from "@/lib/calendarFeed/events";
import type { FeedDetailLevel } from "@/lib/calendarFeed/events";
import { findActiveFeed, insertFeed, revokeActiveFeed, rotateActiveFeed, setActiveFeedDetail } from "@/lib/calendarFeed/store";
import { feedUrl, generateFeedToken, hashFeedToken } from "@/lib/calendarFeed/token";
import { logError } from "@/lib/logError";

/**
 * The signed-in interpreter's calendar subscription (the card on the Calendar page). Every action starts with requireInterpreter() and
 * works only on that interpreter's own active feed: nothing from the browser chooses whose. The secret is returned ONCE, by create and
 * rotate, as the finished address; it is never stored (only its SHA-256), logged or audited. Audit rows hold the action and the feed's id.
 * No page is revalidated: the Calendar page is client-rendered and the card keeps the state the actions return.
 */

export type MyCalendarFeed = {
  detailLevel: FeedDetailLevel;
  createdAt: string;
  rotatedAt: string | null;
  /** ISO, or null when no calendar app has fetched it yet. */
  lastFetchedAt: string | null;
};
export type FeedState = { status: "none" } | { status: "active"; feed: MyCalendarFeed } | { status: "not_ready" | "not_linked" | "error" };
export type FeedChange = { success: true; state: FeedState; url?: string } | { success: false; error: string };

const NOT_LINKED = "Connect your interpreter profile (use the link we emailed you) before subscribing a calendar.";
const NOT_READY = "Calendar subscriptions are not set up on this database yet. Please check back soon.";
const FAILED = "We could not do that. Please try again.";

const me = async () => {
  try {
    return await requireInterpreter();
  } catch {
    return null;
  }
};

const view = (row: NonNullable<Awaited<ReturnType<typeof findActiveFeed>>>): FeedState => ({
  status: "active",
  feed: { detailLevel: row.detailLevel, createdAt: row.createdAt.toISOString(), rotatedAt: row.rotatedAt?.toISOString() ?? null, lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null },
});

const fail = (err: unknown, where: string): FeedChange => {
  if (isMissingTable(err)) return { success: false, error: NOT_READY };
  logError(where, err);
  return { success: false, error: FAILED };
};

/** Where the subscription stands, for the card. */
export async function getMyCalendarFeed(): Promise<FeedState> {
  const own = await me();
  if (!own) return { status: "not_linked" };
  try {
    const row = await findActiveFeed(own.interpreterId);
    return row ? view(row) : { status: "none" };
  } catch (err) {
    if (isMissingTable(err)) return { status: "not_ready" };
    logError("getMyCalendarFeed", err);
    return { status: "error" };
  }
}

/** Makes the interpreter's feed (one at a time) and returns its address, shown once. */
export async function createCalendarFeed(level: FeedDetailLevel): Promise<FeedChange> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  if (!isFeedDetailLevel(level)) return { success: false, error: "Choose how much each event says." };
  const token = generateFeedToken();
  try {
    if (await findActiveFeed(own.interpreterId)) return { success: false, error: "You already have a calendar link. Rotate it to get a new address." };
    const row = await insertFeed(own.interpreterId, hashFeedToken(token), level);
    if (!row) return { success: false, error: FAILED };
    await writeAuditLog({ userId: own.session.user.id, userEmail: own.session.user.email ?? null, action: "calendar_feed_created", details: `feedId=${row.id}; level=${row.detailLevel}` });
    return { success: true, state: view(row), url: feedUrl(getBaseUrl(), token) };
  } catch (err) {
    return fail(err, "createCalendarFeed");
  }
}

/** A new address; the old one stops working at once. Shown once. */
export async function rotateCalendarFeed(): Promise<FeedChange> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  const token = generateFeedToken();
  try {
    const row = await rotateActiveFeed(own.interpreterId, hashFeedToken(token));
    if (!row) return { success: false, error: "You do not have a calendar link yet." };
    await writeAuditLog({ userId: own.session.user.id, userEmail: own.session.user.email ?? null, action: "calendar_feed_rotated", details: `feedId=${row.id}` });
    return { success: true, state: view(row), url: feedUrl(getBaseUrl(), token) };
  } catch (err) {
    return fail(err, "rotateCalendarFeed");
  }
}

/** Ends the subscription: the address answers 404 from now on. */
export async function revokeCalendarFeed(): Promise<FeedChange> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  try {
    const row = await revokeActiveFeed(own.interpreterId);
    if (!row) return { success: false, error: "You do not have a calendar link." };
    await writeAuditLog({ userId: own.session.user.id, userEmail: own.session.user.email ?? null, action: "calendar_feed_revoked", details: `feedId=${row.id}` });
    return { success: true, state: { status: "none" } };
  } catch (err) {
    return fail(err, "revokeCalendarFeed");
  }
}

/** Changes how much each event says. Takes effect on the next sync; the address stays the same. */
export async function setCalendarFeedDetail(level: FeedDetailLevel): Promise<FeedChange> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  if (!isFeedDetailLevel(level)) return { success: false, error: "Choose how much each event says." };
  try {
    const row = await setActiveFeedDetail(own.interpreterId, level);
    if (!row) return { success: false, error: "You do not have a calendar link yet." };
    await writeAuditLog({ userId: own.session.user.id, userEmail: own.session.user.email ?? null, action: "calendar_feed_detail_changed", details: `feedId=${row.id}; level=${row.detailLevel}` });
    return { success: true, state: view(row) };
  } catch (err) {
    return fail(err, "setCalendarFeedDetail");
  }
}
