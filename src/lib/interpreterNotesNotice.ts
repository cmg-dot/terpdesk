import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, offers } from "@/db/schema";
import { getBaseUrl } from "@/lib/baseUrl";
import { buildTerpDeskEmail, emailActionCard, emailButton, escapeHtml } from "@/lib/emailTemplate";
import { interpreterEmailTitle } from "@/lib/jobEmails";
import { createJobDetailsToken } from "@/lib/jobDetailsToken";
import { summarizeJob } from "@/lib/jobSummary";
import type { JobRequestRow } from "@/lib/jobSummary";
import { notifyInterpreter } from "@/lib/notifications";
import { positionOfOffer } from "@/lib/positions";
import { sendEmail } from "@/lib/timesheetEmail";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * Tells each interpreter booked on a job that its booking notes changed: an in-app notice, and an email that says only that there
 * are new notes (with the secure job page link), never what they say. Never throws. SERVER ONLY.
 */
export async function announceInterpreterNotes(request: JobRequestRow): Promise<number> {
  let emailed = 0;
  try {
    const booked = await db
      .select({ offerId: offers.id, interpreterId: offers.interpreterId, email: interpreters.email })
      .from(offers)
      .innerJoin(interpreters, eq(interpreters.id, offers.interpreterId))
      .where(and(eq(offers.requestId, request.id), eq(offers.status, "accepted")));
    const positions = ((request.data ?? {}) as { offerPositions?: unknown }).offerPositions;
    let endsAt = new Date(Number.NaN);
    try {
      endsAt = new Date(resolveRequestTimes(request).endsAt);
    } catch {
      // The link falls back to its minimum lifetime.
    }
    for (const b of booked) {
      await notifyInterpreter(b.interpreterId, {
        type: "job",
        href: `/jobs/${b.offerId}`,
        title: "Booking notes updated",
        message: "The agency updated the notes for one of your bookings. Open the job to read them.",
      });
      if (!b.email) continue;
      const s = summarizeJob(request, positionOfOffer(positions, b.offerId));
      const token = createJobDetailsToken({ requestId: request.id, interpreterId: b.interpreterId }, endsAt);
      const url = token ? `${getBaseUrl()}/job-details?token=${encodeURIComponent(token)}` : null;
      const title = interpreterEmailTitle("Booking notes updated", s);
      const html = buildTerpDeskEmail({
        title,
        preheader: `New notes for your booking on ${s.dateLabel}.`,
        bodyContent: `
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Booking notes updated</h1>
          <p style="margin:0 0 4px;">The agency added or changed the notes for your booking <strong>${escapeHtml(s.emailTitle)}</strong> on ${escapeHtml(s.dateLabel)}.</p>
          ${emailActionCard(url ? `<p style="margin:0;">${emailButton("Read the notes", url)}</p>` : `<p style="margin:0;">Sign in to terpDESK to read them.</p>`)}
          <p style="margin:0;font-size:13px;color:#6B7280;">For your clients' privacy, the notes are only shown in terpDESK, never by email.</p>`,
      });
      const text = [title, "", `The agency added or changed the notes for your booking on ${s.dateLabel}.`, url ? `Read them: ${url}` : "Sign in to terpDESK to read them."].join("\n");
      if ((await sendEmail(b.email, `${title} - terpDESK`, html, text)) === "sent") emailed += 1;
    }
  } catch {
    // Never log the error object: it can include a recipient address.
    console.error("[interpreterNotesNotice] could not announce the booking notes");
  }
  return emailed;
}
