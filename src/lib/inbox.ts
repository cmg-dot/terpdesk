import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agencyInbox } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { INBOX_LIST_LIMIT } from "@/types/inbox";
import type { InboxListItem } from "@/types/inbox";

/**
 * The agency's received emails, newest first, WITHOUT their bodies (an email can hold hundreds of KB of HTML; a body is
 * loaded only when it is opened). SERVER ONLY. Callers must already have checked the agency role.
 */
export async function listInboxEmails(): Promise<InboxListItem[]> {
  const rows = await db
    .select({
      id: agencyInbox.id,
      senderEmail: agencyInbox.senderEmail,
      senderName: agencyInbox.senderName,
      subject: agencyInbox.subject,
      receivedAt: agencyInbox.receivedAt,
      isRead: agencyInbox.isRead,
    })
    .from(agencyInbox)
    .where(eq(agencyInbox.agencyId, DEFAULT_AGENCY_ID))
    .orderBy(desc(agencyInbox.receivedAt))
    .limit(INBOX_LIST_LIMIT);

  return rows.map((row) => ({ ...row, receivedAt: row.receivedAt.toISOString() }));
}
