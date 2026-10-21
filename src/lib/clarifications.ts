import { randomUUID } from "crypto";
import { and, count, eq, gt, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { getBaseUrl } from "@/lib/baseUrl";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { buildTerpDeskEmail, emailActionCard, emailButton } from "@/lib/emailTemplate";
import { notifyAgencyAdmins } from "@/lib/notifications";
import { sendEmail } from "@/lib/timesheetEmail";

/**
 * "Request clarification", shared by the secure job-details link and the app. The caller has already authorized the
 * interpreter as booked on the job. The question is stored on the request (with the interpreter's id, so the agency's
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
  reference: string;
  question: string;
}): Promise<ClarificationResult> {
  const { requestId, interpreterId, reference, question } = params;
  const marker = `requestId=${requestId}; interpreterId=${interpreterId}`;
  const [recent] = await db
    .select({ total: count() })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "job_clarification_requested"), like(auditLogs.details, `${marker}%`), gt(auditLogs.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  if (Number(recent?.total ?? 0) >= MAX_PER_HOUR) {
    return { success: false, error: "You've sent several questions in the last hour. Please contact the agency directly." };
  }

  const name = (await getInterpreterDisplayName(interpreterId).catch(() => null)) || "An interpreter";
  const entry = { id: randomUUID(), interpreterId, interpreterName: name, question, askedAt: new Date().toISOString() };
  // Appended atomically, so two questions at once (or another edit of the request) never overwrite each other.
  await db.execute(sql`
    UPDATE requests
    SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{clarifications}',
      coalesce(data->'clarifications', '[]'::jsonb) || jsonb_build_array(${JSON.stringify(entry)}::jsonb))
    WHERE id = ${requestId}
  `);

  await writeAuditLog({ action: "job_clarification_requested", details: marker });
  await notifyAgencyAdmins({
    type: "job",
    href: `/requests/${requestId}`,
    title: "Question about a booking",
    message: `${name} asked a question about booking ${reference}. Open the request to read it.`,
  });

  // Generic email to agency staff (no question text, no job details).
  const staff = await db.select({ email: users.email }).from(users).where(eq(users.role, "agency"));
  const url = `${getBaseUrl()}/requests/${requestId}`;
  const html = buildTerpDeskEmail({
    title: `Question about booking ${reference}`,
    preheader: "An interpreter has a question about a booking.",
    bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">An interpreter has a question</h1>
      <p style="margin:0 0 4px;">A booked interpreter asked a question about booking ${reference}. For privacy, the question is only shown in terpDESK.</p>
      ${emailActionCard(`<p style="margin:0;">${emailButton("Open the request", url)}</p>`)}`,
  });
  const text = `A booked interpreter asked a question about booking ${reference}. Read it in terpDESK: ${url}`;
  for (const s of staff) {
    await sendEmail(s.email, `Question about booking ${reference}`, html, text).catch(() => {
      console.error("[clarifications] could not email a staff member");
    });
  }
  return { success: true };
}
