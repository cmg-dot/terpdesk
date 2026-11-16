"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { INTERPRETER_NOTES_MAX, readInterpreterNotes, setInterpreterNotesSchema } from "@/lib/interpreterNotes";
import { announceInterpreterNotes } from "@/lib/interpreterNotesNotice";
import { logError } from "@/lib/logError";
import { logActivity } from "@/lib/requestActivity";

export type SetInterpreterNotesResult = { success: true; text: string } | { success: false; error: string };

/**
 * Saves the job's booking notes for its interpreters (requests.data.interpreterNotes) from Staffing. Only that key changes. The booked
 * interpreters are told in the app, and by an email that never contains the notes. Agency staff only; the text is never logged.
 */
export async function setInterpreterNotes(input: unknown): Promise<SetInterpreterNotesResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = setInterpreterNotesSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: `Notes can be up to ${INTERPRETER_NOTES_MAX} characters.` };
  const { requestId, text } = parsed.data;

  let saved;
  let had = false;
  try {
    const [existing] = await db.select({ data: requests.data }).from(requests).where(eq(requests.id, requestId)).limit(1);
    if (!existing) return { success: false, error: "This request no longer exists." };
    had = readInterpreterNotes(existing.data) !== null;
    const value = text ? JSON.stringify({ text, updatedAt: new Date().toISOString() }) : "null";
    [saved] = await db
      .update(requests)
      .set({ data: sql<RequestData>`jsonb_set(${requests.data}, '{interpreterNotes}', ${value}::jsonb, true)`, updatedAt: new Date() })
      .where(eq(requests.id, requestId))
      .returning({ id: requests.id, title: requests.title, createdAt: requests.createdAt, data: requests.data });
  } catch (err) {
    logError("setInterpreterNotes", err);
    return { success: false, error: "We could not save the notes. Please try again." };
  }

  const what = text === "" ? "removed" : had ? "updated" : "added";
  await writeAuditLog({ userId: session.user.id, userEmail: session.user.email ?? null, action: "interpreter_notes_saved", details: `requestId=${requestId}; ${what}; length=${text.length}` });
  await logActivity({ requestId, kind: "interpreter_notes", audience: "shared", message: `Booking notes ${what}`, actorLabel: "Agency staff" });
  if (saved && text) await announceInterpreterNotes(saved);
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/jobs/[id]", "page");
  return { success: true, text };
}
