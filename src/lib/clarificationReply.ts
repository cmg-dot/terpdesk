import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, notifications, offers, requestActivity, requests, users } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { getBaseUrl } from "@/lib/baseUrl";
import { questionHref, withAnswer } from "@/lib/clarificationThread";
import type { Clarification } from "@/lib/clarificationThread";
import { buildTerpDeskEmail, emailActionCard, emailButton } from "@/lib/emailTemplate";
import { logError } from "@/lib/logError";
import { notifyInterpreter } from "@/lib/notifications";
import { AGENCY_MESSAGE_KIND } from "@/lib/requestActivity";
import { sendEmail } from "@/lib/timesheetEmail";
import { formatReference } from "@/utils/statusEngine";

/**
 * Staff answer an interpreter's question about a job. In ONE transaction, under the request's row lock:
 *  - the answer is saved on the question (`requests.data.clarifications`: answer, answeredAt, answeredBy);
 *  - it is added to the interpreter's "Messages from the agency" on their job (an agency message for that interpreter only) and an
 *    agency-only line goes in the history;
 *  - the staff "question" banner notices for it are closed for every staff member (a request's older, unnamed notice only once no
 *    question on it is still open).
 * Then the interpreter gets an in-app notice (banner and bell) and an email with the APT reference and a link to the job only: the
 * question and the answer may mention the client, so neither goes in a notification or an email (security.md). SERVER ONLY.
 */

export type AnswerResult = { success: true; answered: Clarification } | { success: false; error: string };

const LEGACY_HREF = (requestId: string) => `/requests/${requestId}#questions`;

/** The database handle inside a transaction (what `db.transaction` gives its callback). */
export type AnswerTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SavedAnswer = { ok: true; answered: Clarification } | { ok: false; error: string };

/**
 * The transactional part: everything that must be saved together or not at all. Runs on the caller's transaction (so a test can hand it
 * a stand-in). The request is written with a typed `.set({ updatedAt })`, never a raw `Date` inside a `sql` template: drizzle's
 * postgres-js driver turns off the driver's own date serializer, so a raw `Date` there throws and every answer failed ("We could not
 * send your answer"). Any `sql` parameter below is a string or a number.
 */
export async function saveAnswer(tx: AnswerTx, params: { requestId: string; questionId: string; answer: string; staffName: string }, now: Date): Promise<SavedAnswer> {
  const { requestId, questionId, answer, staffName } = params;
  const [row] = await tx.select({ data: requests.data }).from(requests).where(eq(requests.id, requestId)).for("update");
  if (!row) return { ok: false, error: "This request no longer exists." };
  const data = (row.data ?? {}) as Record<string, unknown>;
  const outcome = withAnswer(data.clarifications, questionId, answer, staffName, now);
  if (!outcome.ok) return outcome;

  await tx
    .update(requests)
    .set({ data: sql`jsonb_set(coalesce(data, '{}'::jsonb), '{clarifications}', ${JSON.stringify(outcome.clarifications)}::jsonb)`, updatedAt: now })
    .where(eq(requests.id, requestId));
  const interpreterId = outcome.answered.interpreterId ?? null;
  if (interpreterId) {
    await tx.insert(requestActivity).values({ requestId, kind: AGENCY_MESSAGE_KIND, audience: "shared", interpreterId, message: `Answer to your question: ${answer}`, actorLabel: staffName });
  }
  await tx.insert(requestActivity).values({
    requestId,
    kind: "question_answered",
    audience: "agency",
    interpreterId,
    message: `${staffName} answered ${outcome.answered.interpreterName || "the interpreter"}'s question`,
    actorLabel: staffName,
  });
  const hrefs = [questionHref(requestId, questionId), ...(outcome.stillOpen === 0 ? [LEGACY_HREF(requestId)] : [])];
  await tx
    .update(notifications)
    .set({ bannerDismissedAt: now, isRead: true })
    .where(and(eq(notifications.kind, "offer_question"), inArray(notifications.href, hrefs), isNull(notifications.bannerDismissedAt)));
  return { ok: true, answered: outcome.answered };
}

export async function answerClarification(params: { requestId: string; questionId: string; answer: string; staffName: string; staffUserId: string; staffEmail: string | null }): Promise<AnswerResult> {
  const { requestId, questionId } = params;
  const saved = await db.transaction((tx) => saveAnswer(tx, params, new Date()));
  if (!saved.ok) return { success: false, error: saved.error };

  await writeAuditLog({ userId: params.staffUserId, userEmail: params.staffEmail, action: "job_clarification_answered", details: `requestId=${requestId}; questionId=${questionId}` });
  const interpreterId = saved.answered.interpreterId;
  if (interpreterId) await tellInterpreter(requestId, interpreterId);
  return { success: true, answered: saved.answered };
}

/** The in-app notice and the email. Never throws: the answer is already saved and shown on the job. */
async function tellInterpreter(requestId: string, interpreterId: string): Promise<void> {
  try {
    const [offer] = await db
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.requestId, requestId), eq(offers.interpreterId, interpreterId)))
      .orderBy(desc(offers.updatedAt))
      .limit(1);
    const path = offer ? `/jobs/${offer.id}` : "/jobs";
    const reference = formatReference(requestId);
    await notifyInterpreter(interpreterId, { type: "job", kind: "question_answered", href: path, title: "The agency answered your question", message: `About job ${reference}. Open the job to read the answer.` });

    const [person] = await db
      .select({ email: interpreters.email, loginEmail: users.email })
      .from(interpreters)
      .leftJoin(users, eq(users.id, interpreters.userId))
      .where(eq(interpreters.id, interpreterId))
      .limit(1);
    const to = person?.email || person?.loginEmail;
    if (!to) return;
    const url = `${getBaseUrl()}${path}`;
    const subject = `Answer to your question about job ${reference}`;
    const html = buildTerpDeskEmail({
      title: subject,
      preheader: "The agency answered your question.",
      bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">The agency answered your question</h1>
      <p style="margin:0 0 4px;">Your question about job ${reference} has an answer. For privacy, it is only shown in terpDESK.</p>
      ${emailActionCard(`<p style="margin:0;">${emailButton("Read the answer", url)}</p>`)}`,
    });
    // sendEmail applies Silent Mode and the recipient gate (an interpreter whose emails are switched off gets the in-app notice only).
    await sendEmail(to, subject, html, `Your question about job ${reference} has an answer. Read it in terpDESK: ${url}`);
  } catch (err) {
    logError("answerClarification notify", err);
  }
}
