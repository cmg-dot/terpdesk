import { createHash } from "node:crypto";
import { buildCalendar } from "@/lib/calendarFeed/ics";
import { agencyEvent, busyEvent, eventsInWindow, feedWindow, personalEvent } from "@/lib/calendarFeed/events";
import type { FeedDetailLevel } from "@/lib/calendarFeed/events";
import { readAgencyJobs, readBusySources, readPersonalJobSources } from "@/lib/calendarFeed/sources";

/** What a calendar app calls the subscription. */
export const FEED_NAME = "terpDESK";

/**
 * The feed's text for one interpreter: confirmed agency jobs, personal jobs and busy time from 30 days back to 180 ahead, each as an event
 * that says only what the detail level allows (lib/calendarFeed/events.ts). Plain server code; `interpreterId` is the feed row's own.
 */
export async function buildFeedText(interpreterId: string, level: FeedDetailLevel, now: Date): Promise<string> {
  const { from, to } = feedWindow(now);
  const [agency, personal, busy] = await Promise.all([readAgencyJobs(interpreterId), readPersonalJobSources(interpreterId, from, to), readBusySources(interpreterId, from, to)]);
  const events = eventsInWindow([...agency.map((j) => agencyEvent(j, level)), ...personal.map((j) => personalEvent(j, level)), ...busy.map(busyEvent)], now);
  return buildCalendar(events, FEED_NAME);
}

/** A strong validator for the text (a quoted hash), so a calendar app that already has this version gets a 304. */
export const etagOf = (text: string): string => `"${createHash("sha256").update(text).digest("hex").slice(0, 32)}"`;

/** True when an If-None-Match header names this tag ("*", a list, weak or strong all count). */
export function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  return header.split(",").some((candidate) => candidate.trim().replace(/^W\//, "") === etag);
}
