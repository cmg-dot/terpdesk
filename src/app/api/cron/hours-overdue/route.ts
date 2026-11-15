import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, requests } from "@/db/schema";
import { getBaseUrl } from "@/lib/baseUrl";
import { isCronAuthorized } from "@/lib/cronAuth";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { loadOverdueHours } from "@/lib/hoursOverdue";
import { buildHoursOverdueEmail } from "@/lib/hoursOverdueEmail";
import { summarizeJob } from "@/lib/jobSummary";
import { sendEmail } from "@/lib/timesheetEmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Only bookings that became overdue within this window are emailed, so switching someone's email on never sends old reminders. */
const LOOKBACK_DAYS = 7;
const MAX_PER_RUN = 25;

/**
 * The one-time "hours overdue" reminder (Vercel Cron, daily; see vercel.json). For every booking that passed its 48-business-hour
 * deadline without hours (src/lib/hoursOverdue.ts), the interpreter is emailed once. Every email goes through sendEmail, so the
 * per-interpreter switch, EMAIL_ALLOWLIST and EMAIL_SILENT_MODE all apply.
 *
 * Once per booking: the send is claimed in `data.hoursOverdueReminded` first (so overlapping runs cannot double-send), and the claim
 * is released unless the email actually went out, so a muted interpreter is reminded if their email is turned on within the window.
 * The in-app banner does not depend on this. Counts only in logs: no names, addresses or job details.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const earliestDue = now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  try {
    const overdue = (await loadOverdueHours({ now })).filter((o) => new Date(o.dueAt).getTime() >= earliestDue);
    let sent = 0;
    let held = 0;
    let skipped = 0;
    let failed = 0;
    for (const item of overdue) {
      if (sent + failed >= MAX_PER_RUN) break;
      const key = `${item.interpreterId}:${item.position}`;
      const claimed = (await db.execute(sql`
        UPDATE requests
        SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{hoursOverdueReminded}',
          coalesce(data->'hoursOverdueReminded', '{}'::jsonb) || jsonb_build_object(${key}::text, ${now.toISOString()}::text))
        WHERE id = ${item.requestId} AND NOT (coalesce(data->'hoursOverdueReminded', '{}'::jsonb) ? ${key})
        RETURNING id
      `)) as unknown as unknown[];
      if (claimed.length === 0) {
        skipped++;
        continue;
      }
      const release = () => db.execute(sql`
        UPDATE requests SET data = jsonb_set(data, '{hoursOverdueReminded}', (data->'hoursOverdueReminded') - ${key}::text) WHERE id = ${item.requestId}
      `);
      try {
        const [job] = await db.select({ id: requests.id, title: requests.title, createdAt: requests.createdAt, data: requests.data }).from(requests).where(eq(requests.id, item.requestId)).limit(1);
        const [person] = await db.select({ email: interpreters.email, userId: interpreters.userId }).from(interpreters).where(eq(interpreters.id, item.interpreterId)).limit(1);
        if (!job || !person?.email) {
          await release();
          skipped++;
          continue;
        }
        const name = (await getInterpreterDisplayName(item.interpreterId).catch(() => null)) ?? "";
        const email = buildHoursOverdueEmail({
          summary: summarizeJob(job, item.position),
          name,
          dueAt: new Date(item.dueAt),
          isStateJob: item.isStateJob,
          jobUrl: person.userId ? `${getBaseUrl()}/jobs/${item.offerId}` : null,
        });
        const outcome = await sendEmail(person.email, email.subject, email.html, email.text);
        if (outcome === "sent") {
          sent++;
        } else {
          await release();
          held++;
        }
      } catch {
        // Never log the error: it can echo the recipient address. Released so the next run retries.
        await release().catch(() => undefined);
        failed++;
      }
    }
    console.info(`[cron:hours-overdue] overdue=${overdue.length} sent=${sent} held=${held} skipped=${skipped} failed=${failed}`);
    return NextResponse.json({ success: true, overdue: overdue.length, sent, held, skipped, failed });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? "unknown";
    console.error(`[cron:hours-overdue] failed (code: ${code})`);
    return NextResponse.json({ success: false, error: "Cron run failed" }, { status: 500 });
  }
}
