import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, requests, users } from "@/db/schema";
import { acceptAnswersText } from "@/lib/acceptedOfferAlert";
import type { AcceptAnswerColumns } from "@/lib/acceptedOfferAlert";
import { getBaseUrl } from "@/lib/baseUrl";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { buildTerpDeskEmail, emailActionCard, emailButton, emailDetailsTable, escapeHtml } from "@/lib/emailTemplate";
import { interpreterEmailTitle, summaryRows, summaryText } from "@/lib/jobEmails";
import { jobDetailsFor } from "@/lib/jobSummary";
import type { JobSummary } from "@/lib/jobSummary";
import { logError } from "@/lib/logError";
import { notifyAgencyAdmins, notifyInterpreter } from "@/lib/notifications";
import { sendEmail } from "@/lib/timesheetEmail";
import { interpreterReference } from "@/utils/statusEngine";

/**
 * One place for the booking-lifecycle alerts: each event sends an in-app notification AND an AWS SES email.
 *
 * What goes where (security.md: no PHI in outbound email):
 *  - In-app (inside the signed-in app): date, time and location, with the APT reference and SRN for staff and only the SRN
 *    (on a state job) for an interpreter.
 *  - Email: the restricted job summary only (assignment, date, time, format, generic setting, role, program; staff emails
 *    add the APT reference), never the SRN, an address, notes or a reason, plus a link to sign in for the rest.
 * Never throws: an alert must not undo or block the action that triggered it.
 *
 * SERVER ONLY.
 */

export type AgencyAlertEvent = "offer_accepted" | "offer_declined" | "assignment_given_back" | "timesheet_submitted";
export type InterpreterAlertEvent = "booking_cancelled" | "timesheet_correction_requested";

interface AlertContext {
  requestId: string;
  summary: JobSummary;
  srn: string | null;
  /** Venue (or "Virtual"); in-app only. */
  location: string;
}

async function loadContext(requestId: string, positionNumber?: number): Promise<AlertContext | null> {
  const [request] = await db
    .select({ id: requests.id, title: requests.title, createdAt: requests.createdAt, data: requests.data })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1);
  if (!request) return null;
  const details = jobDetailsFor(request, positionNumber);
  const data = (request.data ?? {}) as { intake?: { odhhSrn?: unknown } };
  const srn = typeof data.intake?.odhhSrn === "string" && data.intake.odhhSrn.trim() ? data.intake.odhhSrn.trim() : null;
  const location = details.isVirtual
    ? `Virtual${details.virtual?.platform ? ` (${details.virtual.platform})` : ""}`
    : details.location?.venue || details.location?.address || "Location to be confirmed";
  return { requestId, summary: details, srn, location };
}

/** Staff: "APT-1A2B3C (SRN 1234567) · Tue, Dec 15, 2026 · 8:00 AM – 9:00 AM PST · Harborview". */
const staffContext = (ctx: AlertContext): string =>
  [`${ctx.summary.reference}${ctx.srn ? ` (SRN ${ctx.srn})` : ""}`, ctx.summary.dateLabel, ctx.summary.timeLabel, ctx.location].join(" · ");

/** Interpreter (in the app): "SRN #1234567 · Tue, Dec 15, 2026 · ..." on a state job; no reference on any other (the APT one is staff-only). */
const interpreterContext = (ctx: AlertContext): string =>
  [interpreterReference(ctx.srn), ctx.summary.dateLabel, ctx.summary.timeLabel, ctx.location].filter(Boolean).join(" · ");

const AGENCY_COPY: Record<AgencyAlertEvent, { title: string; did: string; next: string }> = {
  offer_accepted: { title: "Offer accepted", did: "accepted", next: "The interpreter is now booked." },
  offer_declined: { title: "Offer declined", did: "declined the offer for", next: "This position may need a new offer." },
  assignment_given_back: { title: "Assignment given back", did: "gave back", next: "This position needs a replacement." },
  timesheet_submitted: { title: "Timesheet submitted", did: "submitted hours for", next: "The hours are waiting for your review." },
};

async function sendSafely(to: string, subject: string, html: string, text: string, tag: string): Promise<void> {
  try {
    await sendEmail(to, subject, html, text);
  } catch {
    // Never log the error object: it can include the recipient address.
    console.error(`[lifecycleAlerts] could not send the ${tag} email`);
  }
}

/** Interpreter action -> every agency staff login (in-app) and every agency staff email address. */
export async function alertAgency(params: {
  event: AgencyAlertEvent;
  requestId: string;
  interpreterId: string;
  positionNumber?: number;
  /** Where the alert links in the app (defaults to the request page). */
  href?: string;
  /** offer_accepted: the interpreter's travel answer and availability note, added to the bell (never to the email). */
  answers?: AcceptAnswerColumns;
}): Promise<void> {
  try {
    const ctx = await loadContext(params.requestId, params.positionNumber);
    if (!ctx) return;
    const copy = AGENCY_COPY[params.event];
    const name = (await getInterpreterDisplayName(params.interpreterId).catch(() => null)) || "An interpreter";
    const href = params.href ?? `/requests/${params.requestId}`;
    const accepted = params.event === "offer_accepted";
    const answers = accepted && params.answers ? acceptAnswersText(params.answers) : "";

    await notifyAgencyAdmins({
      type: "job",
      // An acceptance opens straight on the job's Staffing section.
      href: accepted && !params.href ? `${href}#staffing` : href,
      title: copy.title,
      message: [`${name} ${copy.did} ${staffContext(ctx)}. ${copy.next}`, answers].filter(Boolean).join(" "),
    });

    const url = `${getBaseUrl()}${href}`;
    const s = ctx.summary;
    const html = buildTerpDeskEmail({
      title: `${copy.title} ${s.reference}`,
      preheader: `${copy.title} for ${s.dateLabel}.`,
      bodyContent: `
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(copy.title)}</h1>
        <p style="margin:0 0 4px;">${escapeHtml(name)} ${escapeHtml(copy.did)} booking <strong>${escapeHtml(s.reference)}</strong>. ${escapeHtml(copy.next)}</p>
        ${emailActionCard(`${emailDetailsTable(summaryRows(s, { withReference: true }))}<p style="margin:20px 0 0;">${emailButton("Open in terpDESK", url)}</p>`)}
        <p style="margin:0;font-size:13px;color:#6B7280;">For privacy, the SRN, location and notes are only shown in terpDESK.</p>`,
    });
    const text = [`${copy.title}: ${s.reference}`, "", `${name} ${copy.did} booking ${s.reference}. ${copy.next}`, "", summaryText(s, { withReference: true }), "", `Open in terpDESK: ${url}`].join("\n");

    const staff = await db.select({ email: users.email }).from(users).where(eq(users.role, "agency"));
    for (const member of staff) await sendSafely(member.email, `${copy.title} ${s.reference} - terpDESK`, html, text, params.event);
  } catch (err) {
    logError("alertAgency", err);
  }
}

const INTERPRETER_COPY: Record<InterpreterAlertEvent, { title: string; line: string; action: (hasLogin: boolean) => string }> = {
  booking_cancelled: {
    title: "Appointment cancelled",
    line: "The agency cancelled this appointment. You are no longer booked, and it has been removed from your upcoming jobs.",
    action: () => "No action is needed.",
  },
  timesheet_correction_requested: {
    title: "Hours correction requested",
    line: "The agency asked you to correct the hours you reported for this appointment.",
    action: (hasLogin) => (hasLogin ? "Sign in to terpDESK to read their note and update your hours." : "The agency will contact you about the correction."),
  },
};

/** Agency action -> the interpreter (in-app when they have a login, and by email). */
export async function alertInterpreter(params: {
  event: InterpreterAlertEvent;
  requestId: string;
  interpreterId: string;
  positionNumber?: number;
  /** The interpreter's offer id, for the in-app link to their job. */
  offerId?: string;
}): Promise<void> {
  try {
    const ctx = await loadContext(params.requestId, params.positionNumber);
    if (!ctx) return;
    const copy = INTERPRETER_COPY[params.event];
    const [person] = await db
      .select({ email: interpreters.email, userId: interpreters.userId })
      .from(interpreters)
      .where(eq(interpreters.id, params.interpreterId))
      .limit(1);
    const hasLogin = Boolean(person?.userId);
    const href = params.offerId ? `/jobs/${params.offerId}` : "/jobs";

    await notifyInterpreter(params.interpreterId, {
      type: "job",
      href,
      title: copy.title,
      message: `${interpreterContext(ctx)}. ${copy.line} ${copy.action(true)}`,
      // A cancelled booking also shows on the interpreter's schedule banner.
      ...(params.event === "booking_cancelled" ? { kind: "booking_cancelled" as const } : {}),
    });

    if (!person?.email) return;
    const s = ctx.summary;
    const button = hasLogin ? `<p style="margin:20px 0 0;">${emailButton("Open terpDESK", `${getBaseUrl()}${href}`)}</p>` : "";
    const html = buildTerpDeskEmail({
      title: interpreterEmailTitle(copy.title, s),
      preheader: `${copy.title}: ${s.dateLabel}.`,
      bodyContent: `
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(copy.title)}</h1>
        <p style="margin:0 0 4px;">${escapeHtml(copy.line)} ${escapeHtml(copy.action(hasLogin))}</p>
        ${emailActionCard(`${emailDetailsTable(summaryRows(s))}${button}`)}
        <p style="margin:0;font-size:13px;color:#6B7280;">For your clients' privacy, location and notes are never sent by email.</p>`,
    });
    const text = [`${interpreterEmailTitle(copy.title, s)}`, "", copy.line, copy.action(hasLogin), "", summaryText(s)].join("\n");
    await sendSafely(person.email, `${interpreterEmailTitle(copy.title, s)} - terpDESK`, html, text, params.event);
  } catch (err) {
    logError("alertInterpreter", err);
  }
}
