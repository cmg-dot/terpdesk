import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, offers, requests, timesheets } from "@/db/schema";
import { isCronAuthorized } from "@/lib/cronAuth";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { sendOdhhPostJobReminder } from "@/lib/jobEmails";
import { summarizeJob } from "@/lib/jobSummary";
import { resolveRequestTimes } from "@/utils/timezone";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";

/** Only jobs that ended within this window are considered, so a first run never emails old history. */
const LOOKBACK_DAYS = Number(process.env.CRON_ODHH_LOOKBACK_DAYS) || 2;
/** Upper bound per run to stay inside serverless time limits; the rest go out on the next run. */
const MAX_PER_RUN = 50;

const isOdhhProgram = (data: unknown): boolean => {
  const d = (data ?? {}) as { intake?: { program?: string }; program?: string };
  const program = String(d.intake?.program ?? d.program ?? "");
  return program === "WA ODHH" || program === "wa_odhh";
};

/**
 * ODHH post-job reminder (Vercel Cron, see vercel.json). For every ODHH job whose scheduled end has passed, emails each
 * booked interpreter once: "Post-Job Action Required" with the ODHH Assignment Report link.
 *
 * Skipped: cancelled jobs, other programs (Apple Health / agency), jobs whose hours are already logged in terpDESK,
 * and interpreters already reminded for that job. Each send is claimed in the database first, so overlapping runs
 * cannot double-send; a failed send releases the claim and is retried on the next run.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const nowMs = Date.now();
  const earliestEndMs = nowMs - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  try {
    const booked = await db
      .select({ requestId: offers.requestId, interpreterId: offers.interpreterId, createdAt: requests.createdAt, data: requests.data, title: requests.title })
      .from(offers)
      .innerJoin(requests, eq(offers.requestId, requests.id))
      .where(and(eq(offers.status, "accepted"), isNull(requests.canceledAt)));

    const due: { requestId: string; interpreterId: string; row: (typeof booked)[number] }[] = [];
    const seen = new Set<string>();
    for (const row of booked) {
      const key = `${row.requestId}:${row.interpreterId}`;
      if (seen.has(key) || !isOdhhProgram(row.data)) continue;
      seen.add(key);
      const sent = ((row.data ?? {}) as { odhhRemindersSent?: Record<string, string> }).odhhRemindersSent ?? {};
      if (sent[row.interpreterId]) continue;
      let endMs = NaN;
      try {
        endMs = new Date(resolveRequestTimes({ createdAt: row.createdAt, data: row.data }).endsAt).getTime();
      } catch {
        continue;
      }
      if (Number.isNaN(endMs) || endMs > nowMs || endMs < earliestEndMs) continue;
      due.push({ requestId: row.requestId, interpreterId: row.interpreterId, row });
      if (due.length >= MAX_PER_RUN) break;
    }

    let sentCount = 0;
    let skipped = 0;
    let failed = 0;
    for (const job of due) {
      // Hours already logged in terpDESK for this job: nothing to remind about.
      const [logged] = await db
        .select({ id: timesheets.id })
        .from(timesheets)
        .where(and(eq(timesheets.requestId, job.requestId), eq(timesheets.interpreterId, job.interpreterId)))
        .limit(1);
      if (logged) {
        skipped++;
        continue;
      }

      const [interpreter] = await db.select({ email: interpreters.email }).from(interpreters).where(eq(interpreters.id, job.interpreterId)).limit(1);
      if (!interpreter?.email) {
        skipped++;
        continue;
      }

      // Claim first (atomic): only one run can mark this interpreter as reminded for this job.
      const claimed = (await db.execute(sql`
        UPDATE requests
        SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{odhhRemindersSent}',
          coalesce(data->'odhhRemindersSent', '{}'::jsonb) || jsonb_build_object(${job.interpreterId}::text, ${new Date(nowMs).toISOString()}::text))
        WHERE id = ${job.requestId} AND NOT (coalesce(data->'odhhRemindersSent', '{}'::jsonb) ? ${job.interpreterId})
        RETURNING id
      `)) as unknown as unknown[];
      if (claimed.length === 0) {
        skipped++;
        continue;
      }

      try {
        const name = (await getInterpreterDisplayName(job.interpreterId).catch(() => null)) ?? "";
        await sendOdhhPostJobReminder({ to: interpreter.email, name, summary: summarizeJob({ id: job.requestId, ...job.row }) });
        sentCount++;
      } catch {
        // Release the claim so the next run retries. Never log the error: it can echo the recipient address.
        console.error("[cron:odhh-reminders] could not send a reminder; it will be retried");
        await db.execute(sql`
          UPDATE requests SET data = jsonb_set(data, '{odhhRemindersSent}', (data->'odhhRemindersSent') - ${job.interpreterId}::text)
          WHERE id = ${job.requestId}
        `);
        failed++;
      }
    }

    return NextResponse.json({ success: true, considered: due.length, sent: sentCount, skipped, failed });
  } catch (err) {
    logError("cron:odhh-reminders", err);
    return NextResponse.json({ success: false, error: "Reminder run failed." }, { status: 500 });
  }
}
