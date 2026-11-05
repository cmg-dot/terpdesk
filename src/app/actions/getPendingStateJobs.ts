"use server";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { interpreters, offers, requests, timesheets } from "@/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { isStateJobRequest } from "@/lib/stateJob";
import { requestReference } from "@/utils/statusEngine";
import { requestOrganization, requestSrn } from "@/lib/requestSummary";
import { getIanaZone, resolveRequestTimes, utcToWallClock } from "@/utils/timezone";
import { ensureDisplayNameColumns, interpreterDisplayName } from "@/lib/displayName";

export interface PendingStateJob {
  requestId: string;
  interpreterId: string;
  interpreterName: string;
  /** "SRN #202786433"; the short APT reference (e.g. APT-D18510) only for a job that has no SRN. */
  reference: string;
  /** Appointment date in the job's own time zone. */
  dateLabel: string;
  /** Appointment start and end as clock times in the job's zone, e.g. "9:00 AM – 10:30 AM PST". */
  timeLabel: string;
  /** Who the job is for ("Seattle Children's"), or null when only a funding program is on file. */
  organization: string | null;
  /** Scheduled start/end as wall-clock strings (yyyy-MM-ddTHH:mm) in the job's zone, for prefilling. */
  scheduledStart: string;
  scheduledEnd: string;
  timeZone: string;
}

interface LooseData {
  details?: { timeZone?: string; timezone?: string };
  timeZone?: string;
  timezone?: string;
}

const MAX_RESULTS = 200;

/**
 * State jobs (ODHH / Apple Health) that are over, have an assigned interpreter, and have no timesheet row yet,
 * i.e. the ones whose hours still need to be logged from the state receipt.
 */
export async function getPendingStateJobs(): Promise<PendingStateJob[]> {
  await requireRole("agency");
  await ensureDisplayNameColumns();

  const assigned = await db
    .select({
      requestId: offers.requestId,
      interpreterId: offers.interpreterId,
      interpreterName: interpreterDisplayName,
      status: requests.status,
      isStateJob: requests.isStateJob,
      createdAt: requests.createdAt,
      data: requests.data,
    })
    .from(offers)
    .innerJoin(requests, eq(offers.requestId, requests.id))
    .innerJoin(interpreters, eq(offers.interpreterId, interpreters.id))
    .where(and(eq(offers.status, "accepted"), isNull(requests.canceledAt)))
    .orderBy(desc(requests.createdAt));

  const nowMs = Date.now();
  const seen = new Set<string>();
  const candidates: (PendingStateJob & { endMs: number })[] = [];

  for (const row of assigned) {
    const key = `${row.requestId}:${row.interpreterId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!isStateJobRequest(row)) continue;
    if ((row.status ?? "").toLowerCase().includes("cancel")) continue;

    // UTC instants: a naive stored time is read in the job's own zone, so "in the past" is timezone-safe.
    const { startsAt, endsAt } = resolveRequestTimes({ createdAt: row.createdAt, data: row.data });
    const endMs = new Date(endsAt).getTime();
    if (Number.isNaN(endMs) || endMs >= nowMs) continue;

    const data = (row.data ?? {}) as unknown as LooseData;
    const zone = getIanaZone(data.details?.timeZone ?? data.details?.timezone ?? data.timeZone ?? data.timezone);

    candidates.push({
      requestId: row.requestId,
      interpreterId: row.interpreterId,
      interpreterName: row.interpreterName,
      reference: requestReference(requestSrn({ data: row.data }), row.requestId),
      dateLabel: formatInTimeZone(startsAt, zone, "MMM d, yyyy"),
      timeLabel: `${formatInTimeZone(startsAt, zone, "h:mm a")} – ${formatInTimeZone(endsAt, zone, "h:mm a zzz")}`,
      organization: requestOrganization({ requester: row.data.requester, data: row.data }),
      scheduledStart: utcToWallClock(startsAt, zone),
      scheduledEnd: utcToWallClock(endsAt, zone),
      timeZone: zone,
      endMs,
    });
  }
  if (candidates.length === 0) return [];

  // Any timesheet row (pending, submitted, approved...) means hours are already handled or in flight.
  const existing = await db
    .select({ requestId: timesheets.requestId, interpreterId: timesheets.interpreterId })
    .from(timesheets)
    .where(inArray(timesheets.requestId, Array.from(new Set(candidates.map((c) => c.requestId)))));
  const taken = new Set(existing.map((t) => `${t.requestId}:${t.interpreterId}`));

  return candidates
    .filter((c) => !taken.has(`${c.requestId}:${c.interpreterId}`))
    .sort((a, b) => b.endMs - a.endMs)
    .slice(0, MAX_RESULTS)
    .map(({ endMs: _endMs, ...job }) => job);
}
