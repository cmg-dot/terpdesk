import { randomUUID } from "crypto";
import { and, count, eq, gt, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { getBaseUrl } from "@/lib/baseUrl";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { questionHref } from "@/lib/clarificationThread";
import { buildTerpDeskEmail, emailActionCard, emailButton } from "@/lib/emailTemplate";
import { notifyAgencyAdmins } from "@/lib/notifications";
import { logActivity } from "@/lib/requestActivity";
import { sendEmail } from "@/lib/timesheetEmail";

/**
 * "Request clarification" / "Ask a question", shared by the secure job-details link and the app. The caller has already authorized
 * the interpreter (booked on the job, or holding a live offer for it: `beforeAccepting`). The question is stored on the request (with the interpreter's id, so the agency's
 * reply can go to that interpreter only) and shown to staff there. It is NOT put in any email or notification text,
 * since it may mention the client: staff get a generic "question waiting" notice that links to the request.
 *
 * SERVER ONLY.
 */

export type ClarificationResult = { success: true } | { success: false; error: string };

const MAX_PER_HOUR = 5;

/** Strips control characters and trims; the caller validates length. */
export const cleanQuestion = (v: string): string => v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim();

export async function submitClarification(params: {
  requestId: string;
  interpreterId: string;
  /** The APT reference: the only job reference an email may carry. */
  reference: string;
  /** The state's SRN, for the staff's in-app banner and bell only (never an email). */
  srn?: string | null;
  /** Asked on a pending offer, before the interpreter accepted or declined. */
  beforeAccepting?: boolean;
  question: string;
}): Promise<ClarificationResult> {
  const { requestId, interpreterId, reference, question } = params;
  const before = params.beforeAccepting === true;
  const marker = `requestId=${requestId}; interpreterId=${interpreterId}`;
  const [recent] = await db
    .select({ total: count() })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "job_clarification_requested"), like(auditLogs.details, `${marker}%`), gt(auditLogs.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  if (Number(recent?.total ?? 0) >= MAX_PER_HOUR) {
    return { success: false, error: "You've sent several questions in the last hour. Please contact the agency directly." };
  }

  const name = (await getInterpreterDisplayName(interpreterId).catch(() => null)) || "An interpreter";
  const entry = { id: randomUUID(), interpreterId, interpreterName: name, question, askedAt: new Date().toISOString(), ...(before ? { beforeAccepting: true } : {}) };
  // Appended atomically, so two questions at once (or another edit of the request) never overwrite each other.
  await db.execute(sql`
    UPDATE requests
    SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{clarifications}',
      coalesce(data->'clarifications', '[]'::jsonb) || jsonb_build_array(${JSON.stringify(entry)}::jsonb))
    WHERE id = ${requestId}
  `);

  await writeAuditLog({ action: "job_clarification_requested", details: `${marker}${before ? "; beforeAccepting=true" : ""}` });
  // Staff-only history line; the question itself stays in the questions card.
  await logActivity({
    requestId,
    kind: before ? "offer_question" : "booking_question",
    audience: "agency",
    message: before ? `${name} asked a question before accepting` : `${name} asked a question about the booking`,
    actorLabel: name,
  });
  // In the app, staff see the SRN too; the banner (kind) stays at the top of their workspace until they close or open it.
  const inApp = `${reference}${params.srn ? ` (SRN ${params.srn})` : ""}`;
  await notifyAgencyAdmins({
    type: "job",
    kind: "offer_question",
    // Names the question, so the banner's "Answer question" opens this one (see clarificationReply.ts).
    href: questionHref(requestId, entry.id),
    title: before ? "Question before accepting" : "Question about a booking",
    message: before
      ? `${name} asked a question about the offer for ${inApp} before accepting. Open the request to read and answer it.`
      : `${name} asked a question about booking ${inApp}. Open the request to read it.`,
  });

  // Generic email to agency staff: the APT reference and a link only (no question text, no SRN, no job details).
  const what = before ? "job" : "booking";
  const staff = await db.select({ email: users.email }).from(users).where(eq(users.role, "agency"));
  const url = `${getBaseUrl()}/requests/${requestId}`;
  const html = buildTerpDeskEmail({
    title: `Question about ${what} ${reference}`,
    preheader: before ? "An interpreter has a question before accepting an offer." : "An interpreter has a question about a booking.",
    bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">An interpreter has a question</h1>
      <p style="margin:0 0 4px;">${before ? `An interpreter with an open offer asked a question about job ${reference} before accepting.` : `A booked interpreter asked a question about booking ${reference}.`} For privacy, the question is only shown in terpDESK.</p>
      ${emailActionCard(`<p style="margin:0;">${emailButton("Open the request", url)}</p>`)}`,
  });
  const text = `${before ? `An interpreter with an open offer asked a question about job ${reference} before accepting.` : `A booked interpreter asked a question about booking ${reference}.`} Read it in terpDESK: ${url}`;
  for (const s of staff) {
    await sendEmail(s.email, `Question about ${what} ${reference}`, html, text).catch(() => {
      console.error("[clarifications] could not email a staff member");
    });
  }
  return { success: true };
}
