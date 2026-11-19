import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, requests, users } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { getBaseUrl } from "@/lib/baseUrl";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { buildTerpDeskEmail, emailActionCard, emailButton, emailSecondaryButton, escapeHtml } from "@/lib/emailTemplate";
import { summarizeJob } from "@/lib/jobSummary";
import { logError } from "@/lib/logError";
import { notifyInterpreter } from "@/lib/notifications";
import type { NotificationInput } from "@/lib/notifications";
import { offerCardTitle } from "@/lib/offerPlace";
import { positionLabel } from "@/lib/positions";
import { logActivity } from "@/lib/requestActivity";
import type { ActivityInput } from "@/lib/requestActivity";
import { sendEmail } from "@/lib/timesheetEmail";

/**
 * Staff removed an interpreter from a booked position ("Remove booking"). The interpreter is told, and the job keeps a record:
 *  - in the app: a banner at the top of Home and Jobs (and the bell) naming the job's header and its date and time;
 *  - by email: only the APT reference, the date and time and links to their Jobs and Calendar (no place, organization, SRN, client
 *    or notes: security.md); sendEmail applies Silent Mode and the recipient gate;
 *  - on the request: an agency-only history line and an audit row.
 * Never throws: the booking is already removed. SERVER ONLY.
 */

export interface RemovedBooking {
  requestId: string;
  offerId: string;
  interpreterId: string;
  positionNumber: number;
}

export interface RemovalStaff {
  userId: string;
  email: string | null;
  name: string;
}

export interface RemovalJob {
  id: string;
  title: string | null;
  createdAt: Date;
  data: unknown;
}

/** Everything outside the pure copy, so a test can run the real flow with stand-ins. */
export interface RemovalEffects {
  loadJob: (requestId: string) => Promise<RemovalJob | null>;
  interpreter: (interpreterId: string) => Promise<{ email: string | null; name: string }>;
  notify: (interpreterId: string, input: NotificationInput) => Promise<void>;
  email: (to: string, subject: string, html: string, text: string) => Promise<unknown>;
  activity: (entry: ActivityInput) => Promise<void>;
  audit: (entry: { userId: string; userEmail: string | null; action: string; details: string }) => Promise<void>;
  baseUrl: () => string;
}

export interface RemovalCopy {
  bannerTitle: string;
  bannerMessage: string;
  subject: string;
  html: string;
  text: string;
}

/** The interpreter's banner (in the app: the job's header) and email (the APT reference only). Pure. */
export function removalCopy(params: { headline: string; reference: string; dateLabel: string; timeLabel: string; jobsUrl: string; calendarUrl: string }): RemovalCopy {
  const { headline, reference, dateLabel, timeLabel, jobsUrl, calendarUrl } = params;
  const when = `${dateLabel} at ${timeLabel}`;
  const line = `The agency removed you from booking ${reference} on ${when}. It is no longer on your schedule, and no action is needed.`;
  const html = buildTerpDeskEmail({
    title: `Removed from booking ${reference}`,
    preheader: `You have been removed from a booking on ${dateLabel}.`,
    bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">You have been removed from a booking</h1>
      <p style="margin:0 0 4px;">${escapeHtml(line)}</p>
      ${emailActionCard(`<p style="margin:0 0 12px;">${emailButton("Open my jobs", jobsUrl)}</p><p style="margin:0;">${emailSecondaryButton("Open my calendar", calendarUrl)}</p>`)}
      <p style="margin:0;font-size:13px;color:#6B7280;">For your clients' privacy, job details are only shown in terpDESK.</p>`,
  });
  return {
    bannerTitle: "Removed from a booking",
    bannerMessage: `You have been removed from ${headline} on ${when}.`,
    subject: `Removed from booking ${reference} - terpDESK`,
    html,
    text: [line, "", `Your jobs: ${jobsUrl}`, `Your calendar: ${calendarUrl}`, "", "For your clients' privacy, job details are only shown in terpDESK."].join("\n"),
  };
}

export async function announceBookingRemoval(removed: readonly RemovedBooking[], staff: RemovalStaff, fx: RemovalEffects = liveRemovalEffects()): Promise<number> {
  let told = 0;
  for (const booking of removed) {
    try {
      const job = await fx.loadJob(booking.requestId);
      if (!job) continue;
      const summary = summarizeJob(job, booking.positionNumber);
      const person = await fx.interpreter(booking.interpreterId);
      const position = positionLabel(job.data, booking.positionNumber);
      await fx.activity({
        requestId: booking.requestId,
        interpreterId: booking.interpreterId,
        audience: "agency",
        kind: "booking_removed",
        message: `${staff.name} removed ${person.name} from ${position}`,
        actorLabel: staff.name,
      });
      await fx.audit({
        userId: staff.userId,
        userEmail: staff.email,
        action: "booking_removed",
        details: `requestId=${booking.requestId}; offerId=${booking.offerId}; interpreterId=${booking.interpreterId}; position=${booking.positionNumber}`,
      });

      const base = fx.baseUrl();
      const copy = removalCopy({ headline: offerCardTitle(job), reference: summary.reference, dateLabel: summary.dateLabel, timeLabel: summary.timeLabel, jobsUrl: `${base}/jobs`, calendarUrl: `${base}/interpreter-calendar` });
      await fx.notify(booking.interpreterId, { type: "job", kind: "booking_removed", href: "/jobs", title: copy.bannerTitle, message: copy.bannerMessage });
      if (person.email) await fx.email(person.email, copy.subject, copy.html, copy.text);
      told += 1;
    } catch (err) {
      logError("announceBookingRemoval", err);
    }
  }
  return told;
}

export const liveRemovalEffects = (): RemovalEffects => ({
  loadJob: async (requestId) => {
    const [row] = await db.select({ id: requests.id, title: requests.title, createdAt: requests.createdAt, data: requests.data }).from(requests).where(eq(requests.id, requestId)).limit(1);
    return row ?? null;
  },
  interpreter: async (interpreterId) => {
    const [row] = await db
      .select({ email: interpreters.email, loginEmail: users.email })
      .from(interpreters)
      .leftJoin(users, eq(users.id, interpreters.userId))
      .where(eq(interpreters.id, interpreterId))
      .limit(1);
    const name = (await getInterpreterDisplayName(interpreterId).catch(() => null)) || "the interpreter";
    return { email: row?.email || row?.loginEmail || null, name };
  },
  notify: notifyInterpreter,
  email: async (to, subject, html, text) => {
    try {
      return await sendEmail(to, subject, html, text);
    } catch {
      // Never log the error object: it can include the recipient address.
      console.error("[bookingRemoval] could not send the removal email");
      return "failed";
    }
  },
  activity: logActivity,
  audit: writeAuditLog,
  baseUrl: getBaseUrl,
});
