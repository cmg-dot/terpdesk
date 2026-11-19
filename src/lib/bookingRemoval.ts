import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, requests, users } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { getBaseUrl } from "@/lib/baseUrl";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { buildInterpreterNoticeEmail } from "@/lib/jobEmails";
import { summarizeJob } from "@/lib/jobSummary";
import type { JobSummary } from "@/lib/jobSummary";
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
 *  - by email: the same notice as a cancellation (named by its date, the restricted summary, links to their Jobs and Calendar; no
 *    reference, SRN, organization, place, client or notes: security.md); sendEmail applies Silent Mode and the recipient gate;
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

/**
 * The interpreter's banner (in the app: the job's header, "ODHH <SRN> - <organization>" on a state job) and email. The email is the
 * same notice as a cancellation (jobEmails.buildInterpreterNoticeEmail): named by its date, with the restricted summary table; never a
 * reference, an SRN, an organization or a place. Pure.
 */
export function removalCopy(params: { headline: string; summary: JobSummary; jobsUrl: string; calendarUrl: string }): RemovalCopy {
  const { headline, summary: s, jobsUrl, calendarUrl } = params;
  const email = buildInterpreterNoticeEmail({
    title: "Removed from booking",
    line: "The agency removed you from this booking. It is no longer on your schedule.",
    action: "No action is needed.",
    summary: s,
    buttons: [{ label: "Open my jobs", url: jobsUrl }, { label: "Open my calendar", url: calendarUrl }],
    linksInText: true,
  });
  return {
    bannerTitle: "Removed from a booking",
    bannerMessage: `You have been removed from ${headline} on ${s.dateLabel} at ${s.timeLabel}.`,
    ...email,
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
      const copy = removalCopy({ headline: offerCardTitle(job), summary, jobsUrl: `${base}/jobs`, calendarUrl: `${base}/interpreter-calendar` });
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
