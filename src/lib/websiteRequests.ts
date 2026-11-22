import { desc, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { PUBLIC_INTAKE_CHANNEL } from "@/lib/publicIntake";
import { settingLabel } from "@/lib/settingLabel";
import { formatReference } from "@/utils/statusEngine";
import { getIanaZone } from "@/utils/timezone";

/**
 * The Website requests page: every request made from the public intake form (`data.source.channel` = "public_intake_form", saved by
 * POST /api/intake/public and the demo site's /book). Only the few fields the list shows are read, in SQL, so a requester's name,
 * contact details, purpose and notes never leave the database for this page. SERVER ONLY; the caller checks the agency role.
 */

export interface WebsiteRequestRow {
  id: string;
  /** The agency's APT reference. */
  reference: string;
  /** What the request's status reads as on this page ("draft" is "Needs review"). */
  statusLabel: string;
  /** "Tue, Nov 24, 2026 · 9:00 AM PST": the appointment's requested start. */
  requestedFor: string;
  /** "Nov 20, 2:15 PM PST": when the form was submitted; null when the request does not record it. */
  receivedLabel: string | null;
  setting: string;
  format: string;
}

interface RawRow {
  id: string;
  status: string;
  /** The appointment's start (the app stores it in created_at). */
  createdAt: Date;
  receivedAt: string | null;
  setting: string | null;
  format: string | null;
  timeZone: string | null;
}

const STATUS_LABELS: Record<string, string> = { draft: "Needs review", booked: "Booked", completed: "Completed", awaiting_review: "Hours in review" };
export const websiteStatusLabel = (status: string): string => STATUS_LABELS[status] ?? status;

const asDate = (value: string | Date | null): Date | null => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

export function toWebsiteRequestRow(row: RawRow): WebsiteRequestRow {
  const zone = getIanaZone(row.timeZone ?? undefined);
  const start = asDate(row.createdAt);
  const received = asDate(row.receivedAt);
  return {
    id: row.id,
    reference: formatReference(row.id),
    statusLabel: websiteStatusLabel(row.status),
    requestedFor: start ? formatInTimeZone(start, zone, "EEE, MMM d, yyyy · h:mm a zzz") : "Date to be confirmed",
    receivedLabel: received ? formatInTimeZone(received, zone, "MMM d, h:mm a zzz") : null,
    setting: settingLabel(row.setting),
    format: (row.format ?? "").trim() || "Not stated",
  };
}

/** Newest submission first (by when it was submitted, else the requested date). The executor is the database, or an open transaction. */
export async function loadWebsiteRequests(exec: Pick<typeof db, "select"> = db, limit = 200): Promise<WebsiteRequestRow[]> {
  const rows = await exec
    .select({
      id: requests.id,
      status: requests.status,
      createdAt: requests.createdAt,
      receivedAt: sql<string | null>`${requests.data} #>> '{source,receivedAt}'`,
      setting: sql<string | null>`${requests.data} #>> '{details,setting}'`,
      format: sql<string | null>`${requests.data} #>> '{details,format}'`,
      timeZone: sql<string | null>`coalesce(${requests.data} #>> '{details,timeZone}', ${requests.data} #>> '{details,timezone}')`,
    })
    .from(requests)
    .where(sql`${requests.data} #>> '{source,channel}' = ${PUBLIC_INTAKE_CHANNEL}`)
    .orderBy(sql`${requests.data} #>> '{source,receivedAt}' desc nulls last`, desc(requests.createdAt))
    .limit(limit);
  return rows.map(toWebsiteRequestRow);
}
