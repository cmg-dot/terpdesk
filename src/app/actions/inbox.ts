"use server";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { agencyInbox, requests, timesheets } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { NOT_ALLOWED_MESSAGE, hasRole } from "@/lib/auth/guards";
import { extractSrn } from "@/lib/inboxSrn";
import { logError } from "@/lib/logError";
import type { InboxEmailContext, InboxEmailContextResult, OpenInboxEmailResult, SetInboxEmailReadResult } from "@/types/inbox";

const emailIdSchema = z.string().uuid();
const setReadSchema = z.object({ id: z.string().uuid(), isRead: z.boolean() });

const NOT_FOUND = "That email could not be found.";
const FAILED = "Something went wrong. Please try again.";

/** Every write is scoped to the agency's own mailbox, never to the id alone. */
const inMailbox = (id: string) => and(eq(agencyInbox.id, id), eq(agencyInbox.agencyId, DEFAULT_AGENCY_ID));

/** How many of the agency's emails are unread (for the sidebar badge). 0 for anyone who is not an agency user. */
export async function getInboxUnreadCount(): Promise<number> {
  if (!(await hasRole("agency"))) return 0;
  const [row] = await db
    .select({ value: count() })
    .from(agencyInbox)
    .where(and(eq(agencyInbox.agencyId, DEFAULT_AGENCY_ID), eq(agencyInbox.isRead, false)));
  return row?.value ?? 0;
}

/** Opens an email: returns its full content and marks it read, in one round trip. */
export async function openInboxEmail(id: string): Promise<OpenInboxEmailResult> {
  if (!(await hasRole("agency"))) return { success: false, error: NOT_ALLOWED_MESSAGE };
  const parsed = emailIdSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: NOT_FOUND };

  try {
    const [row] = await db
      .update(agencyInbox)
      .set({ isRead: true })
      .where(inMailbox(parsed.data))
      .returning({
        id: agencyInbox.id,
        senderEmail: agencyInbox.senderEmail,
        senderName: agencyInbox.senderName,
        subject: agencyInbox.subject,
        receivedAt: agencyInbox.receivedAt,
        isRead: agencyInbox.isRead,
        bodyText: agencyInbox.bodyText,
        bodyHtml: agencyInbox.bodyHtml,
      });
    if (!row) return { success: false, error: NOT_FOUND };
    revalidatePath("/inbox");
    return { success: true, email: { ...row, receivedAt: row.receivedAt.toISOString() } };
  } catch (error) {
    logError("openInboxEmail", error);
    return { success: false, error: FAILED };
  }
}

/** Sets an email back to unread (or read) without opening it. */
export async function setInboxEmailRead(id: string, isRead: boolean): Promise<SetInboxEmailReadResult> {
  if (!(await hasRole("agency"))) return { success: false, error: NOT_ALLOWED_MESSAGE };
  const parsed = setReadSchema.safeParse({ id, isRead });
  if (!parsed.success) return { success: false, error: NOT_FOUND };

  try {
    const updated = await db
      .update(agencyInbox)
      .set({ isRead: parsed.data.isRead })
      .where(inMailbox(parsed.data.id))
      .returning({ id: agencyInbox.id });
    if (updated.length === 0) return { success: false, error: NOT_FOUND };
    revalidatePath("/inbox");
    return { success: true };
  } catch (error) {
    logError("setInboxEmailRead", error);
    return { success: false, error: FAILED };
  }
}

/**
 * What sits beside an opened email in the inbox: the job that has the email's request number (the live one when there are
 * several) and that job's timesheets (status, actual times, miles, whether a signature is on file, which position). READ ONLY:
 * nothing is changed, and no names or notes are returned. The request number is worked out here from the stored email, never taken from the browser.
 */
export async function getInboxEmailContext(id: string): Promise<InboxEmailContextResult> {
  if (!(await hasRole("agency"))) return { success: false, error: NOT_ALLOWED_MESSAGE };
  const parsed = emailIdSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: NOT_FOUND };
  try {
    const [mail] = await db.select({ subject: agencyInbox.subject, bodyText: agencyInbox.bodyText }).from(agencyInbox).where(inMailbox(parsed.data)).limit(1);
    if (!mail) return { success: false, error: NOT_FOUND };
    const srn = extractSrn(mail.subject, mail.bodyText);
    if (!srn) return { success: true, context: { srn: null, job: null, timesheets: [] } };

    const srnOf = sql<string>`${requests.data}->'intake'->>'odhhSrn'`;
    const found = await db
      .select({ id: requests.id, title: requests.title, status: requests.status, data: requests.data })
      .from(requests)
      .where(eq(srnOf, srn))
      .orderBy(desc(requests.updatedAt));
    const job = [...found].sort((a, b) => Number(a.status === "Cancelled") - Number(b.status === "Cancelled"))[0];
    if (!job) return { success: true, context: { srn, job: null, timesheets: [] } };

    const sheets = await db
      .select({
        id: timesheets.id,
        status: timesheets.status,
        actualStart: timesheets.actualStartTime,
        actualEnd: timesheets.actualEndTime,
        miles: timesheets.mileage,
        signed: sql<boolean>`${timesheets.signatureDataUrl} is not null`,
      })
      .from(timesheets)
      .where(eq(timesheets.requestId, job.id))
      .orderBy(timesheets.submittedAt);
    const data = (job.data ?? {}) as { void?: { kind?: string; at?: string }; hoursSubmissions?: Record<string, { timesheetId?: string }> };
    const slots = data.hoursSubmissions ?? {};
    const context: InboxEmailContext = {
      srn,
      job: { id: job.id, title: job.title, status: job.status, voidedKind: data.void?.kind ?? null, voidedAt: data.void?.at ?? null },
      timesheets: sheets.map((t) => ({
        status: t.status,
        position: Number(Object.keys(slots).find((p) => slots[p]?.timesheetId === t.id)) || null,
        actualStart: t.actualStart ? t.actualStart.toISOString() : null,
        actualEnd: t.actualEnd ? t.actualEnd.toISOString() : null,
        miles: t.miles === null ? null : Number(t.miles),
        hasSignature: Boolean(t.signed),
      })),
    };
    return { success: true, context };
  } catch (error) {
    logError("getInboxEmailContext", error);
    return { success: false, error: FAILED };
  }
}
