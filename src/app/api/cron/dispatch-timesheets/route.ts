import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { offers, requests, timesheets } from "@/db/schema";
import { dispatchTimesheetCore } from "@/lib/timesheetDispatch";
import { resolveRequestTimes } from "@/utils/timezone";
import { isStateJobRequest } from "@/lib/stateJob";

export const dynamic = "force-dynamic";

/** Used only when CRON_SECRET is not set AND this is not a production build. */
const LOCAL_DEV_SECRET = "local-dev-cron-secret";

/** Only jobs that ended within this window are considered, so a first run never mass-emails old history. */
const LOOKBACK_DAYS = Number(process.env.CRON_TIMESHEET_LOOKBACK_DAYS) || 14;
/** Upper bound per run to stay inside serverless time limits; the rest go out on the next run. */
const MAX_PER_RUN = 25;

/** Request statuses where hours are already in (or the job is closed), so no timesheet should be sent. */
const SKIP_STATUSES = ["awaiting_review", "correction_requested", "approved", "completed", "billed"];

interface HoursData {
  hoursSubmission?: unknown;
  hoursSubmissions?: Record<string, unknown>;
}

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Compared as SHA-256 digests in constant time. */
function isAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET || (process.env.NODE_ENV !== "production" ? LOCAL_DEV_SECRET : "");
  if (!secret || !header || !header.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(header.slice("Bearer ".length)), digest(secret));
}

interface Candidate {
  requestId: string;
  interpreterId: string;
  endsAtMs: number;
}

interface JobOutcome {
  requestId: string;
  interpreterId: string;
  dispatched: boolean;
  error?: string;
}

export async function GET(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const nowMs = Date.now();
  const earliestEndMs = nowMs - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  try {
    // "Assigned" = an accepted offer. Cancelled requests are excluded in the query.
    const assigned = await db
      .select({
        requestId: offers.requestId,
        interpreterId: offers.interpreterId,
        status: requests.status,
        isStateJob: requests.isStateJob,
        createdAt: requests.createdAt,
        data: requests.data,
      })
      .from(offers)
      .innerJoin(requests, eq(offers.requestId, requests.id))
      .where(and(eq(offers.status, "accepted"), isNull(requests.canceledAt)));

    // End time is stored inside the request JSON, so it is evaluated here. resolveRequestTimes returns an
    // absolute UTC instant (naive times are read in the job's own zone), making the comparison timezone-safe.
    const seen = new Set<string>();
    const candidates: Candidate[] = [];
    for (const row of assigned) {
      const key = `${row.requestId}:${row.interpreterId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (isStateJobRequest(row)) continue;

      const status = (row.status ?? "").toLowerCase();
      if (status.includes("cancel") || status.includes("draft") || SKIP_STATUSES.includes(status)) continue;

      const data = (row.data ?? {}) as unknown as HoursData;
      if (data.hoursSubmission || Object.keys(data.hoursSubmissions ?? {}).length > 0) continue;

      const { endsAt } = resolveRequestTimes({ createdAt: row.createdAt, data: row.data });
      const endsAtMs = new Date(endsAt).getTime();
      if (Number.isNaN(endsAtMs)) continue;
      if (!(endsAtMs < nowMs) || endsAtMs < earliestEndMs) continue;

      candidates.push({ requestId: row.requestId, interpreterId: row.interpreterId, endsAtMs });
    }

    // A timesheet row is the "already dispatched" marker (the shared dispatcher removes it if the email fails).
    let pending = candidates;
    if (candidates.length > 0) {
      const existing = await db
        .select({ requestId: timesheets.requestId, interpreterId: timesheets.interpreterId })
        .from(timesheets)
        .where(inArray(timesheets.requestId, Array.from(new Set(candidates.map((c) => c.requestId)))));
      const dispatched = new Set(existing.map((t) => `${t.requestId}:${t.interpreterId}`));
      pending = candidates.filter((c) => !dispatched.has(`${c.requestId}:${c.interpreterId}`));
    }

    const batch = pending.sort((a, b) => a.endsAtMs - b.endsAtMs).slice(0, MAX_PER_RUN);

    const jobs: JobOutcome[] = [];
    for (const job of batch) {
      try {
        const result = await dispatchTimesheetCore({ requestId: job.requestId, interpreterId: job.interpreterId });
        jobs.push({
          requestId: job.requestId,
          interpreterId: job.interpreterId,
          dispatched: result.success,
          ...(result.success ? {} : { error: result.error }),
        });
      } catch {
        jobs.push({ requestId: job.requestId, interpreterId: job.interpreterId, dispatched: false, error: "Unexpected error" });
      }
    }

    const dispatchedCount = jobs.filter((j) => j.dispatched).length;
    // Counts only: no titles, names or emails in logs.
    console.info(`[cron:dispatch-timesheets] eligible=${pending.length} attempted=${jobs.length} dispatched=${dispatchedCount}`);

    return NextResponse.json({
      success: true,
      dispatchedCount,
      failedCount: jobs.length - dispatchedCount,
      remaining: Math.max(0, pending.length - batch.length),
      jobs,
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? "unknown";
    console.error(`[cron:dispatch-timesheets] failed (code: ${code})`);
    return NextResponse.json({ success: false, error: "Cron run failed" }, { status: 500 });
  }
}
