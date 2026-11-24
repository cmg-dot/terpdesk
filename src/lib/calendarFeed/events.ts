import { genericSetting } from "@/lib/genericSetting";
import type { IcsEvent } from "@/lib/calendarFeed/ics";

/**
 * What goes into an interpreter's calendar feed, and what each event is allowed to say. Pure.
 *
 * The feed leaves terpDESK for a calendar app (Apple, Google, a phone, sometimes a shared family calendar), and an event already synced
 * cannot be recalled, so an event's title is only one of three fixed phrases:
 *   an agency job   "terpDESK job"
 *   a personal job  "Personal job"
 *   busy time       "Busy"
 * At the `generic` detail level a job also names ONE generic setting category (lib/genericSetting.ts: Medical, Legal, Educational,
 * Mental Health, Social Services, Employment or General), never the form's own words. Nothing else is ever put in an event: no client,
 * organization, address, meeting link, note, busy-block title or personal-job label (those are the interpreter's private words).
 */

export type FeedDetailLevel = "busy" | "generic";
export const FEED_DETAIL_LEVELS: readonly FeedDetailLevel[] = ["busy", "generic"];
export const isFeedDetailLevel = (value: unknown): value is FeedDetailLevel => value === "busy" || value === "generic";

/** How far back and ahead the feed reaches. */
export const FEED_DAYS_BACK = 30;
export const FEED_DAYS_AHEAD = 180;
const DAY_MS = 86_400_000;

export const feedWindow = (now: Date): { from: Date; to: Date } => ({
  from: new Date(now.getTime() - FEED_DAYS_BACK * DAY_MS),
  to: new Date(now.getTime() + FEED_DAYS_AHEAD * DAY_MS),
});

export const AGENCY_JOB_TITLE = "terpDESK job";
export const PERSONAL_JOB_TITLE = "Personal job";
export const BUSY_TITLE = "Busy";

const seconds = (date: Date): number => Math.floor(date.getTime() / 1000);
const withSetting = (title: string, level: FeedDetailLevel, category: string | null): string => (level === "generic" && category ? `${title}: ${category}` : title);

/** A job the interpreter is booked on through an agency. `rawSetting` is the request's own wording; only its generic category is used. */
export interface AgencyJobSource {
  offerId: string;
  startsAt: Date;
  endsAt: Date;
  rawSetting: string;
  updatedAt: Date;
}
export interface PersonalJobSource {
  id: string;
  startsAt: Date;
  endsAt: Date;
  setting: string;
  updatedAt: Date;
}
export interface BusySource {
  id: string;
  startsAt: Date;
  endsAt: Date;
  revision: number;
}

export const agencyEvent = (job: AgencyJobSource, level: FeedDetailLevel): IcsEvent => ({
  uid: `job-${job.offerId}@terpdesk`,
  startsAt: job.startsAt,
  endsAt: job.endsAt,
  summary: withSetting(AGENCY_JOB_TITLE, level, genericSetting(job.rawSetting)),
  modified: job.updatedAt,
  sequence: seconds(job.updatedAt),
});

export const personalEvent = (job: PersonalJobSource, level: FeedDetailLevel): IcsEvent => ({
  uid: `personal-${job.id}@terpdesk`,
  startsAt: job.startsAt,
  endsAt: job.endsAt,
  // A personal job's setting is optional; with none, the title stays plain.
  summary: withSetting(PERSONAL_JOB_TITLE, level, job.setting.trim() === "" ? null : genericSetting(job.setting)),
  modified: job.updatedAt,
  sequence: seconds(job.updatedAt),
});

export const busyEvent = (block: BusySource): IcsEvent => ({
  uid: `busy-${block.id}@terpdesk`,
  startsAt: block.startsAt,
  endsAt: block.endsAt,
  summary: BUSY_TITLE,
  // A busy block has no timestamp of its own: it carries a revision that goes up when it is edited.
  modified: block.startsAt,
  sequence: block.revision,
});

/** The events that overlap the window, soonest first (ties by id), with an unusable time range left out. */
export function eventsInWindow(events: readonly IcsEvent[], now: Date): IcsEvent[] {
  const { from, to } = feedWindow(now);
  return events
    .filter((e) => !Number.isNaN(e.startsAt.getTime()) && !Number.isNaN(e.endsAt.getTime()) && e.endsAt > e.startsAt && e.endsAt > from && e.startsAt < to)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.uid.localeCompare(b.uid));
}
