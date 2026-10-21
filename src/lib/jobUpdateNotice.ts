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

function buildUpdateEmail(s: JobSummary, changes: JobFieldChange[], detailsUrl: string | null) {
  const items = changes.map((c) => `<li style="margin:0 0 6px;">${escapeHtml(changeLine(c))}</li>`).join("");
  const html = buildTerpDeskEmail({
    title: `Job details updated ${s.reference}`,
    preheader: `The agency changed your booking for ${s.dateLabel}.`,
    bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Job details updated</h1>
      <p style="margin:0 0 4px;">The agency changed your booking <strong>${escapeHtml(s.reference)}</strong> (${escapeHtml(s.title)}). You're still booked. Here is what changed:</p>
      ${emailActionCard(`
        <ul style="margin:0;padding-left:20px;">${items}</ul>
        ${detailsUrl ? `<p style="margin:20px 0 0;">${emailButton("View updated job details", detailsUrl)}</p>` : ""}
      `)}
      <p style="margin:0;font-size:13px;color:#6B7280;">For your clients' privacy, location and meeting details are never sent by email. If the new details don't work for you, contact the agency.</p>`,
  });
  const text = [
    `Job details updated: ${s.reference} (${s.title})`,
    "",
    "The agency changed your booking. You're still booked. What changed:",
    ...changes.map((c) => `- ${changeLine(c)}`),
    "",
    detailsUrl ? `Updated job details: ${detailsUrl}` : "Sign in to terpDESK to see the updated details.",
  ].join("\n");
  return { subject: `Job details updated ${s.reference} - terpDESK`, html, text };
}

async function emailInterpreter(after: JobRequestRow, b: BookedInterpreter, changes: JobFieldChange[]): Promise<boolean> {
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
    const email = buildUpdateEmail(summarizeJob(after, b.position), changes, detailsUrl);
    await sendEmail(row.email, email.subject, email.html, email.text);
    return true;
  } catch {
    // Never log the error object: it can include the recipient address.
    console.error("[jobUpdateNotice] could not send the job update email");
    return false;
  }
}

/** Logs the edit and tells each booked interpreter. Never throws: the edit is already saved. */
export async function announceEdit(after: JobRequestRow, notice: EditNotice, actorLabel: string | null): Promise<{ notified: number }> {
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
  if (changes.length === 0 || booked.length === 0) return { notified: 0 };

  let notified = 0;
  for (const b of booked) {
    if (await emailInterpreter(after, b, changes)) notified += 1;
    await notifyInterpreter(b.interpreterId, {
      type: "job",
      href: `/jobs/${b.offerId}`,
      title: "Job details updated",
      message: `The agency changed: ${changes.map((c) => c.field).join(", ")}. Open the job to review.`,
    });
  }
  await writeAuditLog({
    action: "job_update_notice_sent",
    details: `requestId=${after.id}; booked=${booked.length}; emailed=${notified}; fields=${changes.map((c) => c.field).join("|")}`,
  });
  return { notified };
}
