import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { agencyInbox, requests } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { BODY_SERVICE_REQUEST_SQL_PATTERN, BODY_SRN_SQL_PATTERN, SRN_SEARCH_CHARS, SUBJECT_SRN_SQL_PATTERN, srnFromCandidates } from "@/lib/inboxSrn";
import { INBOX_LIST_LIMIT } from "@/types/inbox";
import type { InboxListItem } from "@/types/inbox";

/**
 * The agency's received emails, newest first, WITHOUT their bodies (an email can hold hundreds of KB of HTML; a body is
 * loaded only when it is opened). Each email also carries the state request number it is about and, when a job with that
 * number exists, that job's id, so the inbox can link straight to the request. SERVER ONLY. Callers must already have checked
 * the agency role.
 */
export async function listInboxEmails(): Promise<InboxListItem[]> {
  const head = sql`left(${agencyInbox.bodyText}, ${SRN_SEARCH_CHARS})`;
  const rows = await db
    .select({
      id: agencyInbox.id,
      senderEmail: agencyInbox.senderEmail,
      senderName: agencyInbox.senderName,
      subject: agencyInbox.subject,
      receivedAt: agencyInbox.receivedAt,
      isRead: agencyInbox.isRead,
      bodyRequestMatch: sql<string | null>`substring(${head} from ${BODY_SERVICE_REQUEST_SQL_PATTERN})`,
      bodySrnMatch: sql<string | null>`substring(${head} from ${BODY_SRN_SQL_PATTERN})`,
      subjectMatch: sql<string | null>`substring(${agencyInbox.subject} from ${SUBJECT_SRN_SQL_PATTERN})`,
    })
    .from(agencyInbox)
    .where(eq(agencyInbox.agencyId, DEFAULT_AGENCY_ID))
    .orderBy(desc(agencyInbox.receivedAt))
    .limit(INBOX_LIST_LIMIT);

  const srns = rows.map((row) => srnFromCandidates([row.bodyRequestMatch, row.bodySrnMatch, row.subjectMatch]));
  const wanted = Array.from(new Set(srns.filter((srn): srn is string => srn !== null)));
  const jobBySrn = new Map<string, string>();
  if (wanted.length > 0) {
    const srnOf = sql<string>`${requests.data}->'intake'->>'odhhSrn'`;
    // A number can have a cancelled job and a live one: link the live one, and the newest of equals.
    const jobs = await db
      .select({ id: requests.id, srn: srnOf, status: requests.status })
      .from(requests)
      .where(inArray(srnOf, wanted))
      .orderBy(desc(requests.updatedAt));
    for (const job of [...jobs].sort((a, b) => Number(a.status === "Cancelled") - Number(b.status === "Cancelled"))) {
      if (!jobBySrn.has(job.srn)) jobBySrn.set(job.srn, job.id);
    }
  }

  return rows.map(({ bodyRequestMatch, bodySrnMatch, subjectMatch, ...row }, i) => ({
    ...row,
    receivedAt: row.receivedAt.toISOString(),
    srn: srns[i],
    jobId: srns[i] ? jobBySrn.get(srns[i] as string) ?? null : null,
  }));
}
