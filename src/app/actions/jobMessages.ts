"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { offers } from "@/db/schema";
import { requireInterpreter, NOT_ALLOWED_MESSAGE } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { listAgencyMessages } from "@/lib/requestActivity";
import type { AgencyMessage } from "@/lib/requestActivity";

export type JobMessagesResult = { success: true; messages: AgencyMessage[] } | { success: false; error: string };

/** The agency's messages to the signed-in interpreter about one of their jobs (session-scoped: only their own). */
export async function getMyJobMessages(offerId: string): Promise<JobMessagesResult> {
  let interpreterId: string;
  try {
    ({ interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = z.string().uuid().safeParse(offerId);
  if (!parsed.success) return { success: false, error: "Unknown job." };
  try {
    const [own] = await db
      .select({ requestId: offers.requestId })
      .from(offers)
      .where(and(eq(offers.id, parsed.data), eq(offers.interpreterId, interpreterId)))
      .limit(1);
    if (!own) return { success: false, error: "Unknown job." };
    return { success: true, messages: await listAgencyMessages(own.requestId, interpreterId) };
  } catch (err) {
    logError("getMyJobMessages", err);
    return { success: false, error: "We could not load messages for this job." };
  }
}
