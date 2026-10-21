"use server";

import { randomUUID } from "crypto";
import { and, count, eq, gt, like, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, requests, users } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { getBaseUrl } from "@/lib/baseUrl";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { buildTerpDeskEmail, emailActionCard, emailButton } from "@/lib/emailTemplate";
import { resolveJobDetailsLink } from "@/lib/jobDetailsAccess";
import { logError } from "@/lib/logError";
import { notifyAgencyAdmins } from "@/lib/notifications";
import { sendEmail } from "@/lib/timesheetEmail";

export type ClarificationResult = { success: true } | { success: false; error: string };

const schema = z.object({
  token: z.string().min(1).max(2000),
  question: z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(3, "Please write your question.").max(500, "Questions can be up to 500 characters.")),
});

const MAX_PER_HOUR = 5;

/**
 * "Request clarification" from the secure job-details page (no sign-in; the signed link plus a live "still booked"
 * check is the authorization). The question is stored on the request and shown to agency staff there. It is NOT put
 * in any email or in the notification text, since it may mention the client: staff get a generic "question waiting"
 * notification and email that link to the request.
 */
export async function requestJobClarification(input: z.input<typeof schema>): Promise<ClarificationResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid question." };
  const { token, question } = parsed.data;

  try {
    const access = await resolveJobDetailsLink(token);
    if (!access.ok) return { success: false, error: "This link is no longer valid, so the question could not be sent." };

    const marker = `requestId=${access.requestId}; interpreterId=${access.interpreterId}`;
    const [recent] = await db
      .select({ total: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "job_clarification_requested"), like(auditLogs.details, `${marker}%`), gt(auditLogs.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
    if (Number(recent?.total ?? 0) >= MAX_PER_HOUR) {
      return { success: false, error: "You've sent several questions in the last hour. Please contact the agency directly." };
    }

    const name = (await getInterpreterDisplayName(access.interpreterId).catch(() => null)) || "An interpreter";
    const entry = { id: randomUUID(), interpreterId: access.interpreterId, interpreterName: name, question, askedAt: new Date().toISOString() };
    // Appended atomically, so two questions at once (or another edit of the request) never overwrite each other.
    await db.execute(sql`
      UPDATE requests
      SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{clarifications}',
        coalesce(data->'clarifications', '[]'::jsonb) || jsonb_build_array(${JSON.stringify(entry)}::jsonb))
      WHERE id = ${access.requestId}
    `);

    await writeAuditLog({ action: "job_clarification_requested", details: marker });
    await notifyAgencyAdmins({
      type: "job",
      href: `/requests/${access.requestId}`,
      title: "Question about a booking",
      message: `${name} asked a question about booking ${access.details.reference}. Open the request to read it.`,
    });

    // Generic email to agency staff (no question text, no job details).
    const staff = await db.select({ email: users.email }).from(users).where(eq(users.role, "agency"));
    const url = `${getBaseUrl()}/requests/${access.requestId}`;
    const html = buildTerpDeskEmail({
      title: `Question about booking ${access.details.reference}`,
      preheader: "An interpreter has a question about a booking.",
      bodyContent: `
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">An interpreter has a question</h1>
        <p style="margin:0 0 4px;">A booked interpreter asked a question about booking ${access.details.reference}. For privacy, the question is only shown in terpDESK.</p>
        ${emailActionCard(`<p style="margin:0;">${emailButton("Open the request", url)}</p>`)}`,
    });
    const text = `A booked interpreter asked a question about booking ${access.details.reference}. Read it in terpDESK: ${url}`;
    for (const s of staff) {
      await sendEmail(s.email, `Question about booking ${access.details.reference}`, html, text).catch(() => {
        console.error("[jobClarification] could not email a staff member");
      });
    }
    return { success: true };
  } catch (err) {
    logError("requestJobClarification", err);
    return { success: false, error: "We could not send your question. Please try again." };
  }
}
