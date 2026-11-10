"use server";

import { and, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { db } from "@/db";
import { availabilityShares, busyBlocks, interpreters, offers, requests } from "@/db/schema";
import { DEFAULT_AGENCY_ID, DEFAULT_AGENCY_TIME_ZONE } from "@/lib/agency";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { interpreterDisplayName } from "@/lib/displayNameSql";
import type { InterpreterDayViewResult, TimelineBusy, TimelineInterpreter, TimelineJob } from "@/lib/interpreterDayView";
import { logError } from "@/lib/logError";
import { getRosterInterpreters, getRosterProfileTags } from "@/lib/roster";
import { dayWindow, mergeSpans, nextDateKey, previousDateKey } from "@/lib/resourceTimeline";
import { splitCredentials } from "@/lib/timelineFilters";
import { hasSeveralPositions, positionCount, positionOfOffer, positionOrdinal } from "@/lib/positions";
import { interpreterDayViewInputSchema } from "@/lib/validation/interpreterDayView";
import { resolveRequestTimes } from "@/utils/timezone";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** The date text a request stores for its start (the first one present), as its first ten characters (yyyy-MM-dd). */
const storedStartDate = sql<string>`left(coalesce(
  ${requests.data}->>'customStartsAt',
  ${requests.data}->>'startsAt',
  ${requests.data}->'details'->>'customStartsAt',
  ${requests.data}->'details'->>'startsAt',
  ${requests.data}->'details'->>'startDate',
  ''
), 10)`;

/**
 * The Interpreter View's data for ONE day: the agency's roster, and for each person the jobs they are booked on (an
 * accepted offer) that touch that day. Agency staff only.
 *
 * It reads only what that day needs. The SQL narrows to bookings whose stored start date is within a day either side
 * (a cheap, index-free text compare, so a zone difference can never drop a job), then the exact test is made here, in
 * the agency's zone, with the same time reader the rest of the app uses. Cancelled jobs are left out. Nothing is written.
 *
 * Busy time: an interpreter's saved "private busy time" is returned ONLY for interpreters who share their availability with
 * this agency (the same rule as the interpreter profile page), as bare start/end times with overlaps merged. The private
 * title is never selected, so it cannot reach the browser. Interpreters who don't share are flagged so the screen never
 * shows them as "free" when it simply can't know.
 *
 * Each person also carries their credential tags and location tags (agency-only data, which is why this is agency-only)
 * so the screen can filter the rows without asking the server again when the filters or the day change.
 */
export async function getInterpreterDayView(input: { date: string }): Promise<InterpreterDayViewResult> {
  try {
    await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = interpreterDayViewInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Choose a valid date." };
  const { date } = parsed.data;
  const zone = DEFAULT_AGENCY_TIME_ZONE;

  try {
    await ensureAvailabilityTables();
    const window = dayWindow(date, zone);
    const loKey = previousDateKey(date);
    const hiKey = nextDateKey(date);
    const loCreated = new Date(window.startMs - 36 * 3_600_000);
    const hiCreated = new Date(window.endMs + 36 * 3_600_000);

    const [roster, profileTags, sharing, busyRows, bookings] = await Promise.all([
      getRosterInterpreters(DEFAULT_AGENCY_ID),
      getRosterProfileTags(DEFAULT_AGENCY_ID),
      db
        .select({ interpreterId: availabilityShares.interpreterId })
        .from(availabilityShares)
        .where(and(eq(availabilityShares.agencyId, DEFAULT_AGENCY_ID), eq(availabilityShares.enabled, true))),
      // Start and end only (never the title), only for people sharing with this agency, only what touches the day.
      db
        .select({ interpreterId: busyBlocks.interpreterId, startsAt: busyBlocks.startsAt, endsAt: busyBlocks.endsAt })
        .from(busyBlocks)
        .innerJoin(
          availabilityShares,
          and(eq(availabilityShares.interpreterId, busyBlocks.interpreterId), eq(availabilityShares.agencyId, DEFAULT_AGENCY_ID), eq(availabilityShares.enabled, true)),
        )
        .where(and(gt(busyBlocks.endsAt, new Date(window.startMs)), lt(busyBlocks.startsAt, new Date(window.endMs)))),
      db
        .select({
          offerId: offers.id,
          requestId: requests.id,
          interpreterId: offers.interpreterId,
          interpreterName: interpreterDisplayName,
          title: requests.title,
          status: requests.status,
          createdAt: requests.createdAt,
          canceledAt: requests.canceledAt,
          data: requests.data,
        })
        .from(offers)
        .innerJoin(requests, eq(offers.requestId, requests.id))
        .leftJoin(interpreters, eq(offers.interpreterId, interpreters.id))
        .where(
          and(
            eq(offers.status, "accepted"),
            isNull(requests.canceledAt),
            or(
              sql`${storedStartDate} between ${loKey} and ${hiKey}`,
              // Older rows that never stored a start date: fall back to when the request was created.
              and(sql`${storedStartDate} = ''`, gte(requests.createdAt, loCreated), lte(requests.createdAt, hiCreated)),
            ),
          ),
        ),
    ]);

    const jobs: TimelineJob[] = [];
    const names = new Map<string, string>();
    for (const row of bookings) {
      if (/cancel/i.test(row.status ?? "")) continue;
      const data: Record<string, unknown> = isRecord(row.data) ? row.data : {};
      const { startsAt, endsAt } = resolveRequestTimes({ createdAt: row.createdAt, data });
      const start = new Date(startsAt).getTime();
      const end = new Date(endsAt).getTime();
      if (Number.isNaN(start) || Number.isNaN(end) || end <= window.startMs || start >= window.endMs) continue;

      const details: Record<string, unknown> = isRecord(data.details) ? data.details : {};
      const onsite: Record<string, unknown> = isRecord(data.onsite) ? data.onsite : {};
      const offerPositions: Record<string, unknown> = isRecord(data.offerPositions) ? data.offerPositions : {};
      names.set(row.interpreterId, row.interpreterName);
      jobs.push({
        offerId: row.offerId,
        requestId: row.requestId,
        interpreterId: row.interpreterId,
        title: row.title,
        status: row.status,
        startsAt,
        endsAt,
        location: text(data.location) ?? text(onsite.venue) ?? text(details.location),
        position: positionOrdinal(data, positionOfOffer(offerPositions, row.offerId)),
        positionCount: positionCount(data),
        team: hasSeveralPositions(data),
      });
    }
    jobs.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    const shares = new Set(sharing.map((s) => s.interpreterId));
    const people = new Map<string, TimelineInterpreter>(
      roster.map((r) => {
        const tags = profileTags.get(r.id);
        return [r.id, { id: r.id, name: r.name, active: r.rosterActive !== false, onRoster: true, sharesAvailability: shares.has(r.id), credentials: splitCredentials(tags?.certification), areas: tags?.areas ?? [] }];
      }),
    );
    // Someone booked that day who is no longer on the approved roster still gets a row, so their job is never hidden.
    // We hold no agency-approved profile facts for them, so a credential or location filter can't match them.
    for (const job of jobs) {
      if (!people.has(job.interpreterId)) {
        people.set(job.interpreterId, { id: job.interpreterId, name: names.get(job.interpreterId) ?? "Unknown interpreter", active: false, onRoster: false, sharesAvailability: shares.has(job.interpreterId), credentials: [], areas: [] });
      }
    }
    const interpretersList = Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name));

    // Busy time per person, overlaps merged (also hides how many separate private entries there were).
    const busyByPerson = new Map<string, { startsAt: string; endsAt: string }[]>();
    for (const row of busyRows) {
      busyByPerson.set(row.interpreterId, [...(busyByPerson.get(row.interpreterId) ?? []), { startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() }]);
    }
    const busy: TimelineBusy[] = [];
    busyByPerson.forEach((spans, interpreterId) => {
      for (const span of mergeSpans(spans)) busy.push({ interpreterId, startsAt: span.startsAt, endsAt: span.endsAt });
    });

    return { success: true, view: { date, zone, interpreters: interpretersList, jobs, busy } };
  } catch (err) {
    logError("getInterpreterDayView", err);
    return { success: false, error: "We could not load the interpreter schedule. Please try again." };
  }
}
