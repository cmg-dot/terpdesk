"use server";

import { and, asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agencyInbox, requests } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { FORM_LABELS, classifyStateEmail, sortOriginalForms } from "@/lib/originalForms";
import type { OriginalFormEmail, OriginalFormsResult } from "@/lib/originalForms";

const MAX_HTML_CHARS = 400_000;
const MAX_TEXT_CHARS = 60_000;
const MAX_EMAILS = 20;
const SRN = /^\d{9}$/;

/**
 * The state's own emails for one job, for the "View original form" panel: the request form, and whatever the state sent
 * after it (booking notice, cancellation, hours report). Found in the Inbox by the job's SRN (a digits-only value, so the
 * match is exact and safe), newest data last. When the Inbox has no request form but terpDESK saved the email's text on the
 * job when it created it, that saved copy is offered instead. Agency staff only; reading changes nothing.
 */
export async function getOriginalForms(requestId: unknown): Promise<OriginalFormsResult> {
  try {
    await requireRole("agency");
  } catch {
    return { success: false, error: "You don't have access to this." };
  }
  const id = z.string().uuid().safeParse(requestId);
  if (!id.success) return { success: false, error: "That job could not be found." };

  try {
    const [row] = await db
      .select({ srn: sql<string | null>`${requests.data} #>> '{intake,odhhSrn}'`, source: sql<Record<string, unknown> | null>`${requests.data} -> 'source'` })
      .from(requests)
      .where(eq(requests.id, id.data))
      .limit(1);
    if (!row) return { success: false, error: "That job could not be found." };
    const srn = row.srn && SRN.test(row.srn.trim()) ? row.srn.trim() : null;

    const emails: OriginalFormEmail[] = [];
    if (srn) {
      const pattern = `%${srn}%`;
      const found = await db
        .select({ id: agencyInbox.id, subject: agencyInbox.subject, bodyText: agencyInbox.bodyText, bodyHtml: agencyInbox.bodyHtml, receivedAt: agencyInbox.receivedAt })
        .from(agencyInbox)
        .where(and(eq(agencyInbox.agencyId, DEFAULT_AGENCY_ID), or(sql`${agencyInbox.subject} like ${pattern}`, sql`${agencyInbox.bodyText} like ${pattern}`)))
        .orderBy(asc(agencyInbox.receivedAt))
        .limit(MAX_EMAILS);
      for (const e of found) {
        const kind = classifyStateEmail(e.subject, e.bodyText);
        emails.push({
          id: e.id,
          kind,
          label: FORM_LABELS[kind],
          subject: e.subject,
          receivedAt: e.receivedAt.toISOString(),
          bodyText: e.bodyText.slice(0, MAX_TEXT_CHARS),
          bodyHtml: e.bodyHtml && e.bodyHtml.length <= MAX_HTML_CHARS ? e.bodyHtml : null,
        });
      }
    }

    // No request form in the Inbox: the copy saved on the job (only jobs created from an email have one).
    const saved = typeof row.source?.rawContent === "string" ? row.source.rawContent : null;
    if (saved && !emails.some((e) => e.kind === "request_form")) {
      emails.push({
        id: "saved-copy",
        kind: "request_form",
        label: FORM_LABELS.request_form,
        subject: typeof row.source?.subject === "string" ? row.source.subject : "Request form",
        receivedAt: typeof row.source?.receivedAt === "string" ? row.source.receivedAt : new Date(0).toISOString(),
        bodyText: saved.slice(0, MAX_TEXT_CHARS),
        bodyHtml: null,
        savedCopy: true,
      });
    }
    return { success: true, srn, emails: sortOriginalForms(emails) };
  } catch (err) {
    logError("getOriginalForms", err);
    return { success: false, error: "We could not load the original email. Please try again." };
  }
}
