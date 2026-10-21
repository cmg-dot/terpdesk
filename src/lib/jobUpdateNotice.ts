import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, offers } from "@/db/schema";
import { getBaseUrl } from "@/lib/baseUrl";
import { writeAuditLog } from "@/lib/audit";
import { buildTerpDeskEmail, emailActionCard, emailButton, escapeHtml } from "@/lib/emailTemplate";
import { createJobDetailsToken } from "@/lib/jobDetailsToken";
import { summarizeJob } from "@/lib/jobSummary";
import type { JobRequestRow, JobSummary } from "@/lib/jobSummary";
import { notifyInterpreter } from "@/lib/notifications";
import { logActivity } from "@/lib/requestActivity";
import { agencyOnlyChangedSections, describeChange, diffJobForInterpreter } from "@/lib/requestChanges";
import type { JobFieldChange } from "@/lib/requestChanges";
import { sendEmail } from "@/lib/timesheetEmail";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * Post-booking edits: what changed, who is booked, and telling them.
 * `planEditNotice` runs BEFORE the save (so the request can be flagged in the same write); `announceEdit` AFTER it.
 *
 * SERVER ONLY.
 */

export interface BookedInterpreter {
  offerId: string;
  interpreterId: string;
  position: 1 | 2;
}

export interface EditNotice {
  changes: JobFieldChange[];
  agencySections: string[];
  booked: BookedInterpreter[];
}

/** Stored on requests.data so the interpreter's job card can show "Updated". */
export interface DetailsUpdateFlag {
  at: string;
  fields: string[];
  offerIds: string[];
}

export async function planEditNotice(before: JobRequestRow, after: JobRequestRow): Promise<EditNotice> {
  const changes = diffJobForInterpreter(before, after);
  const agencySections = agencyOnlyChangedSections(before, after);
  const rows = await db
    .select({ offerId: offers.id, interpreterId: offers.interpreterId })
    .from(offers)
    .where(and(eq(offers.requestId, before.id), eq(offers.status, "accepted")));
  const positions = ((before.data ?? {}) as { offerPositions?: Record<string, number> }).offerPositions ?? {};
  const booked = rows.map((r) => ({ ...r, position: positions[r.offerId] === 2 ? (2 as const) : (1 as const) }));
  return { changes, agencySections, booked };
}

export function detailsUpdateFlag(notice: EditNotice): DetailsUpdateFlag | null {
  if (notice.changes.length === 0 || notice.booked.length === 0) return null;
  return { at: new Date().toISOString(), fields: notice.changes.map((c) => c.field), offerIds: notice.booked.map((b) => b.offerId) };
}

const changeLine = (c: JobFieldChange): string =>
  c.emailSafe ? describeChange(c) : `${c.field} was updated (see the secure job page)`;

function buildUpdateEmail(s: JobSummary, changes: JobFieldChange[], detailsUrl: string | null, message?: string) {
  const hasChanges = changes.length > 0;
  const items = changes.map((c) => `<li style="margin:0 0 6px;">${escapeHtml(changeLine(c))}</li>`).join("");
  // The agency's own words (e.g. the answer to a clarification question). escapeHtml keeps it inert; pre-line keeps its line breaks.
  const messageBlock = message
    ? `<div style="margin:0 0 16px;padding:12px 14px;background:#F3F4F6;border-left:4px solid #0B3B32;border-radius:6px;">
         <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em;">Message from the agency</p>
         <p style="margin:0;white-space:pre-line;">${escapeHtml(message)}</p>
       </div>`
    : "";
  const html = buildTerpDeskEmail({
    title: hasChanges ? `Job details updated ${s.reference}` : `Message about ${s.reference}`,
    preheader: hasChanges ? `The agency changed your booking for ${s.dateLabel}.` : `The agency sent you a message about your booking for ${s.dateLabel}.`,
    bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${hasChanges ? "Job details updated" : "A message about your booking"}</h1>
      <p style="margin:0 0 12px;">${hasChanges ? "The agency changed your booking" : "The agency sent you a note about your booking"} <strong>${escapeHtml(s.reference)}</strong> (${escapeHtml(s.title)}). You're still booked.${hasChanges ? " Here is what changed:" : ""}</p>
      ${messageBlock}
      ${emailActionCard(`
        ${hasChanges ? `<ul style="margin:0;padding-left:20px;">${items}</ul>` : ""}
        ${detailsUrl ? `<p style="margin:${hasChanges ? "20px" : "0"} 0 0;">${emailButton("View job details", detailsUrl)}</p>` : ""}
      `)}
      <p style="margin:0;font-size:13px;color:#6B7280;">For your clients' privacy, location and meeting details are never sent by email. If the new details don't work for you, contact the agency.</p>`,
  });
  const text = [
    hasChanges ? `Job details updated: ${s.reference} (${s.title})` : `Message about your booking: ${s.reference} (${s.title})`,
    "",
    hasChanges ? "The agency changed your booking. You're still booked. What changed:" : "The agency sent you a note. You're still booked.",
    ...changes.map((c) => `- ${changeLine(c)}`),
    ...(message ? ["", "Message from the agency:", message] : []),
    "",
    detailsUrl ? `Job details: ${detailsUrl}` : "Sign in to terpDESK to see the job details.",
  ].join("\n");
  return { subject: hasChanges ? `Job details updated ${s.reference} - terpDESK` : `Message about your booking ${s.reference} - terpDESK`, html, text };
}

async function emailInterpreter(after: JobRequestRow, b: BookedInterpreter, changes: JobFieldChange[], message?: string): Promise<boolean> {
  try {
    const [row] = await db.select({ email: interpreters.email }).from(interpreters).where(eq(interpreters.id, b.interpreterId)).limit(1);
    if (!row?.email) return false;
    let endsAt = new Date(Number.NaN);
    try {
      endsAt = new Date(resolveRequestTimes(after).endsAt);
    } catch {
      // Token falls back to its minimum lifetime.
    }
    const token = createJobDetailsToken({ requestId: after.id, interpreterId: b.interpreterId }, endsAt);
    const detailsUrl = token ? `${getBaseUrl()}/job-details?token=${encodeURIComponent(token)}` : null;
    const email = buildUpdateEmail(summarizeJob(after, b.position), changes, detailsUrl, message);
    await sendEmail(row.email, email.subject, email.html, email.text);
    return true;
  } catch {
    // Never log the error object: it can include the recipient address.
    console.error("[jobUpdateNotice] could not send the job update email");
    return false;
  }
}

/**
 * Logs the edit and tells each booked interpreter, adding the agency's optional message to the email. A message with
 * no field changes is still sent (answering a clarification needs no edit). Never throws: the edit is already saved.
 */
export async function announceEdit(after: JobRequestRow, notice: EditNotice, actorLabel: string | null, message?: string): Promise<{ notified: number }> {
  const { changes, agencySections, booked } = notice;
  const activityChanges = changes.map(({ field, from, to }) => ({ field, from, to }));
  if (changes.length > 0) {
    await logActivity({
      requestId: after.id,
      kind: "details_updated",
      audience: "shared",
      message: changes.length === 1 ? describeChange(changes[0]) : `Job details updated (${changes.length} changes)`,
      changes: activityChanges,
      actorLabel,
    });
  }
  if (agencySections.length > 0) {
    await logActivity({
      requestId: after.id,
      kind: "agency_details_updated",
      message: `Staff-only details updated: ${agencySections.join(", ")}`,
      actorLabel,
    });
  }
  if ((changes.length === 0 && !message) || booked.length === 0) return { notified: 0 };

  let notified = 0;
  for (const b of booked) {
    if (await emailInterpreter(after, b, changes, message)) notified += 1;
    await notifyInterpreter(b.interpreterId, {
      type: "job",
      href: `/jobs/${b.offerId}`,
      title: changes.length > 0 ? "Job details updated" : "Message from the agency",
      message: changes.length > 0
        ? `The agency changed: ${changes.map((c) => c.field).join(", ")}.${message ? " They also sent you a message." : ""} Open the job to review.`
        : "The agency sent you a message about this job. Check your email.",
    });
  }
  await writeAuditLog({
    action: "job_update_notice_sent",
    // The message text itself is never logged, only whether one was included.
    details: `requestId=${after.id}; booked=${booked.length}; emailed=${notified}; withMessage=${Boolean(message)}; fields=${changes.map((c) => c.field).join("|")}`,
  });
  return { notified };
}
