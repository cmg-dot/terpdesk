import { and, count, desc, eq, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { PUBLIC_INTAKE_CHANNEL } from "@/lib/publicIntake";
import { settingLabel } from "@/lib/settingLabel";
import { formatReference } from "@/utils/statusEngine";
import { getIanaZone } from "@/utils/timezone";

/**
 * The Website requests page: every request made from the public intake form (`data.source.channel` = "public_intake_form", saved by
 * POST /api/intake/public and the demo site's /book). Only the fields the board shows are read, in SQL, one by one: a requester's email
 * address and phone number, the purpose, the people needing an interpreter, communication preferences and qualifications never leave the
 * database for this page. SERVER ONLY; the caller checks the agency role.
 */

/** The date tile on a card, read in the request's own time zone. */
export interface DateTile {
  month: string;
  day: string;
  weekday: string;
}

export interface WebsiteRequestRow {
  id: string;
  /** The agency's APT reference. */
  reference: string;
  /** What the request's status reads as on this page ("draft" is "Needs review"). */
  statusLabel: string;
  /** True while the request is still an unreviewed draft: these make up the queue. */
  needsReview: boolean;
  /** The card's title: the organization, else the requester's name, else a plain placeholder. */
  organization: string;
  /** The requester's name when one was given. Shown in the opened preview only. */
  requesterName: string | null;
  /** "Tue, Nov 24, 2026 · 9:00 AM PST": the appointment's requested start. */
  requestedFor: string;
  /** "9:00 AM to 10:00 AM PST" (both ends dated when it runs past midnight); null when the end is not known. */
  timeRange: string | null;
  dateTile: DateTile | null;
  /** The appointment's start and when the form was submitted, as ISO instants (for sorting and the waiting/urgency labels). */
  startsAt: string | null;
  receivedAt: string | null;
  /** "Nov 20, 2:15 PM PST": when the form was submitted; null when the request does not record it. */
  receivedLabel: string | null;
  setting: string;
  /** "In person", "Virtual" or "Hybrid". */
  format: string;
  location: string;
  /** The street address, only when it adds something to the location. */
  address: string | null;
  /** The requester's suggestion ("One interpreter", "Team of two", "Not sure"); staff decide the positions. */
  teamSuggested: string | null;
  /** How the requester prefers to be reached: the method only, never the email address or phone number. */
  preferredContact: string | null;
  repeats: boolean;
  recurrenceNote: string | null;
}

interface RawRow {
  id: string;
  status: string;
  /** The appointment's start (the app stores it in created_at). */
  createdAt: Date;
  endsAt?: string | null;
  receivedAt: string | null;
  setting: string | null;
  format: string | null;
  timeZone: string | null;
  org?: string | null;
  requesterName?: string | null;
  prefContact?: string | null;
  teamSuggested?: string | null;
  repeats?: string | null;
  recurrenceNote?: string | null;
  location?: string | null;
  venue?: string | null;
  address?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Needs review",
  booked: "Booked",
  completed: "Completed",
  awaiting_review: "Hours in review",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  voided: "Voided",
  returned: "Returned",
};
export const websiteStatusLabel = (status: string): string => STATUS_LABELS[status] ?? status;

export const NO_ORGANIZATION = "Organization not provided";

const asDate = (value: string | Date | null | undefined): Date | null => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

/** One line of text, or null when there is nothing in it. */
const line = (value: string | null | undefined): string | null => (value ?? "").replace(/\s+/g, " ").trim() || null;

/** The format as the board shows it. The public form's "Hybrid" choice carries a long explanation that the board does not need. */
export const websiteFormatLabel = (value: string | null | undefined): string => {
  const text = line(value);
  if (!text) return "Not stated";
  return text.toLowerCase().startsWith("hybrid") ? "Hybrid" : text;
};

function timeRangeOf(start: Date | null, end: Date | null, zone: string): string | null {
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  const sameDay = formatInTimeZone(start, zone, "yyyy-MM-dd") === formatInTimeZone(end, zone, "yyyy-MM-dd");
  return sameDay
    ? `${formatInTimeZone(start, zone, "h:mm a")} to ${formatInTimeZone(end, zone, "h:mm a zzz")}`
    : `${formatInTimeZone(start, zone, "EEE, MMM d, h:mm a")} to ${formatInTimeZone(end, zone, "EEE, MMM d, h:mm a zzz")}`;
}

export function toWebsiteRequestRow(row: RawRow): WebsiteRequestRow {
  const zone = getIanaZone(row.timeZone ?? undefined);
  const start = asDate(row.createdAt);
  const end = asDate(row.endsAt);
  const received = asDate(row.receivedAt);
  const requesterName = line(row.requesterName);
  const venue = line(row.venue);
  const address = line(row.address);
  const format = websiteFormatLabel(row.format);
  const location = line(row.location) ?? venue ?? address ?? (format === "Virtual" ? "Virtual" : "Location to be confirmed");
  const note = (row.recurrenceNote ?? "").trim();
  return {
    id: row.id,
    reference: formatReference(row.id),
    statusLabel: websiteStatusLabel(row.status),
    needsReview: row.status === "draft",
    organization: line(row.org) ?? requesterName ?? NO_ORGANIZATION,
    requesterName,
    requestedFor: start ? formatInTimeZone(start, zone, "EEE, MMM d, yyyy · h:mm a zzz") : "Date to be confirmed",
    timeRange: timeRangeOf(start, end, zone),
    dateTile: start ? { month: formatInTimeZone(start, zone, "MMM"), day: formatInTimeZone(start, zone, "d"), weekday: formatInTimeZone(start, zone, "EEE") } : null,
    startsAt: start ? start.toISOString() : null,
    receivedAt: received ? received.toISOString() : null,
    receivedLabel: received ? formatInTimeZone(received, zone, "MMM d, h:mm a zzz") : null,
    setting: settingLabel(row.setting),
    format,
    location,
    address: address && address !== location ? address : null,
    teamSuggested: line(row.teamSuggested),
    preferredContact: line(row.prefContact),
    repeats: row.repeats === "true",
    recurrenceNote: row.repeats === "true" && note ? note : null,
  };
}

type Executor = Pick<typeof db, "select">;

const fromPublicForm = sql`${requests.data} #>> '{source,channel}' = ${PUBLIC_INTAKE_CHANNEL}`;
/** One value out of the request's data. `path` is a constant in this file (never user input), written like "requester,org". */
const at = (path: string) => sql<string | null>`${requests.data} #>> ${sql.raw(`'{${path}}'`)}`;

/** Newest submission first (by when it was submitted, else the requested date). The executor is the database, or an open transaction. */
export async function loadWebsiteRequests(exec: Executor = db, limit = 200): Promise<WebsiteRequestRow[]> {
  const rows = await exec
    .select({
      id: requests.id,
      status: requests.status,
      createdAt: requests.createdAt,
      endsAt: at("endsAt"),
      receivedAt: at("source,receivedAt"),
      setting: at("details,setting"),
      format: at("details,format"),
      timeZone: sql<string | null>`coalesce(${at("details,timeZone")}, ${at("details,timezone")})`,
      org: at("requester,org"),
      requesterName: at("requester,name"),
      prefContact: at("requester,prefContact"),
      teamSuggested: at("requester,teamSuggested"),
      repeats: at("repeats"),
      recurrenceNote: at("recurrenceNote"),
      location: at("overview,location"),
      venue: at("onsite,venue"),
      address: at("onsite,address"),
    })
    .from(requests)
    .where(fromPublicForm)
    .orderBy(sql`${at("source,receivedAt")} desc nulls last`, desc(requests.createdAt))
    .limit(limit);
  return rows.map(toWebsiteRequestRow);
}

/** How many website requests are still waiting for review (the sidebar badge). */
export async function countWebsiteRequestsNeedingReview(exec: Executor = db): Promise<number> {
  const [row] = await exec
    .select({ value: count() })
    .from(requests)
    .where(and(fromPublicForm, eq(requests.status, "draft")));
  return row?.value ?? 0;
}
