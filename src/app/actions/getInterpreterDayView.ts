"use server";

import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { db } from "@/db";
import { interpreters, offers, requests } from "@/db/schema";
import { DEFAULT_AGENCY_ID, DEFAULT_AGENCY_TIME_ZONE } from "@/lib/agency";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { interpreterDisplayName } from "@/lib/displayNameSql";
import type { InterpreterDayViewResult, TimelineInterpreter, TimelineJob } from "@/lib/interpreterDayView";
import { logError } from "@/lib/logError";
import { getRosterInterpreters } from "@/lib/roster";
import { dayWindow, nextDateKey, previousDateKey } from "@/lib/resourceTimeline";
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

    const [roster, bookings] = await Promise.all([
      getRosterInterpreters(DEFAULT_AGENCY_ID),
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
        position: offerPositions[row.offerId] === 2 ? 2 : 1,
        team: data.slotCount === 2 || details.slotCount === 2 || data.requiredPositions === 2,
      });
    }
    jobs.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    const people = new Map<string, TimelineInterpreter>(
      roster.map((r) => [r.id, { id: r.id, name: r.name, active: r.rosterActive !== false, onRoster: true }]),
    );
    // Someone booked that day who is no longer on the approved roster still gets a row, so their job is never hidden.
    for (const job of jobs) {
      if (!people.has(job.interpreterId)) people.set(job.interpreterId, { id: job.interpreterId, name: names.get(job.interpreterId) ?? "Unknown interpreter", active: false, onRoster: false });
    }
    const interpretersList = Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, view: { date, zone, interpreters: interpretersList, jobs } };
  } catch (err) {
    logError("getInterpreterDayView", err);
    return { success: false, error: "We could not load the interpreter schedule. Please try again." };
  }
}
