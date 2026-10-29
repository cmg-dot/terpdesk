"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { agencyInbox } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { NOT_ALLOWED_MESSAGE, hasRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import type { OpenInboxEmailResult, SetInboxEmailReadResult } from "@/types/inbox";

const emailIdSchema = z.string().uuid();
const setReadSchema = z.object({ id: z.string().uuid(), isRead: z.boolean() });

const NOT_FOUND = "That email could not be found.";
const FAILED = "Something went wrong. Please try again.";

/** Every write is scoped to the agency's own mailbox, never to the id alone. */
const inMailbox = (id: string) => and(eq(agencyInbox.id, id), eq(agencyInbox.agencyId, DEFAULT_AGENCY_ID));

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
