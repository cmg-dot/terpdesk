import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { interpreterPersonalJobs } from "@/db/personalJobsSchema";
import { busyBlocks, offers, requests } from "@/db/schema";
import { resolveInterpreterIds } from "@/lib/availability/ids";
import { isMissingTable } from "@/lib/availability/personalJobConflict";
import { isBookedForCalendar } from "@/lib/calendarFeed/bookedRule";
import type { AgencyJobSource, BusySource, PersonalJobSource } from "@/lib/calendarFeed/events";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * The reads behind the feed. Plain server code (not a Server Action), called only by lib/calendarFeed/feed.ts with the interpreter id of
 * the feed row (never an id from the browser). Each read selects only the columns the feed needs: a personal job's label, a busy block's
 * title, a request's client and place are never read at all.
 */

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
const loose = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const later = (a: Date | null, b: Date | null): Date => (a && b ? (a > b ? a : b) : (a ?? b ?? new Date(0)));

/** Jobs booked through an agency: accepted offers on requests that are not cancelled (the Calendar page's rule). */
export async function readAgencyJobs(interpreterId: string): Promise<AgencyJobSource[]> {
  const rows = await db
    .select({
      offerId: offers.id,
      offerStatus: offers.status,
      offerUpdatedAt: offers.updatedAt,
      requestStatus: requests.status,
      canceledAt: requests.canceledAt,
      title: requests.title,
      createdAt: requests.createdAt,
      data: requests.data,
      requestUpdatedAt: requests.updatedAt,
    })
    .from(offers)
    .innerJoin(requests, eq(offers.requestId, requests.id))
    .where(and(eq(offers.interpreterId, interpreterId), eq(offers.status, "accepted")));

  const jobs: AgencyJobSource[] = [];
  for (const row of rows) {
    if (!isBookedForCalendar(row.offerStatus, { status: row.requestStatus, canceledAt: row.canceledAt }, row.title ?? "")) continue;
    const { startsAt, endsAt } = resolveRequestTimes({ createdAt: row.createdAt, data: row.data });
    const data = loose(row.data);
    const details = loose(data.details);
    jobs.push({
      offerId: row.offerId,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      rawSetting: textOf(details.setting) || textOf(data.setting),
      updatedAt: later(row.offerUpdatedAt, row.requestUpdatedAt),
    });
  }
  return jobs;
}

/** The interpreter's own personal jobs in the window (id, setting and times only). Until migration 0014 is applied there are none. */
export async function readPersonalJobSources(interpreterId: string, from: Date, to: Date): Promise<PersonalJobSource[]> {
  try {
    const rows = await db
      .select({ id: interpreterPersonalJobs.id, setting: interpreterPersonalJobs.setting, startsAt: interpreterPersonalJobs.startsAt, endsAt: interpreterPersonalJobs.endsAt, updatedAt: interpreterPersonalJobs.updatedAt })
      .from(interpreterPersonalJobs)
      .where(and(eq(interpreterPersonalJobs.interpreterId, interpreterId), gt(interpreterPersonalJobs.endsAt, from), lt(interpreterPersonalJobs.startsAt, to)));
    return rows.map((r) => ({ id: r.id, setting: r.setting ?? "", startsAt: r.startsAt, endsAt: r.endsAt, updatedAt: r.updatedAt }));
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

/** The interpreter's private busy time in the window (id, times and revision only: never the title they typed). */
export async function readBusySources(interpreterId: string, from: Date, to: Date): Promise<BusySource[]> {
  const ids = await resolveInterpreterIds(interpreterId);
  const rows = await db
    .select({ id: busyBlocks.id, startsAt: busyBlocks.startsAt, endsAt: busyBlocks.endsAt, revision: busyBlocks.revision })
    .from(busyBlocks)
    .where(and(inArray(busyBlocks.interpreterId, ids), gt(busyBlocks.endsAt, from), lt(busyBlocks.startsAt, to)));
  return rows.map((r) => ({ id: r.id, startsAt: r.startsAt, endsAt: r.endsAt, revision: r.revision }));
}
