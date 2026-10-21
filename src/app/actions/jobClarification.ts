"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { offers } from "@/db/schema";
import { requireInterpreter, NOT_ALLOWED_MESSAGE } from "@/lib/auth/guards";
import { cleanQuestion, submitClarification } from "@/lib/clarifications";
import type { ClarificationResult } from "@/lib/clarifications";
import { resolveJobDetailsLink } from "@/lib/jobDetailsAccess";
import { logError } from "@/lib/logError";
import { formatReference } from "@/utils/statusEngine";

export type { ClarificationResult };

const questionSchema = z
  .string()
  .transform(cleanQuestion)
  .pipe(z.string().min(3, "Please write your question.").max(500, "Questions can be up to 500 characters."));

/** "Request clarification" from the secure job-details page (the signed link plus a live "still booked" check authorize it). */
export async function requestJobClarification(input: { token: string; question: string }): Promise<ClarificationResult> {
  const parsed = z.object({ token: z.string().min(1).max(2000), question: questionSchema }).safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid question." };
  try {
    const access = await resolveJobDetailsLink(parsed.data.token);
    if (!access.ok) return { success: false, error: "This link is no longer valid, so the question could not be sent." };
    return await submitClarification({
      requestId: access.requestId,
      interpreterId: access.interpreterId,
      reference: access.details.reference,
      question: parsed.data.question,
    });
  } catch (err) {
    logError("requestJobClarification", err);
    return { success: false, error: "We could not send your question. Please try again." };
  }
}

/** The same, from the signed-in app. Only for the interpreter's own accepted booking (session-scoped). */
export async function requestJobClarificationInApp(input: { offerId: string; question: string }): Promise<ClarificationResult> {
  let interpreterId: string;
  try {
    ({ interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = z.object({ offerId: z.string().uuid(), question: questionSchema }).safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid question." };
  try {
    const [own] = await db
      .select({ requestId: offers.requestId })
      .from(offers)
      .where(and(eq(offers.id, parsed.data.offerId), eq(offers.interpreterId, interpreterId), eq(offers.status, "accepted")))
      .limit(1);
    if (!own) return { success: false, error: "You can only ask about a job you're booked on." };
    return await submitClarification({
      requestId: own.requestId,
      interpreterId,
      reference: formatReference(own.requestId),
      question: parsed.data.question,
    });
  } catch (err) {
    logError("requestJobClarificationInApp", err);
    return { success: false, error: "We could not send your question. Please try again." };
  }
}
