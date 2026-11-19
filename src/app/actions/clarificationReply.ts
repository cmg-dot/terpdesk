"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { answerClarification } from "@/lib/clarificationReply";
import { MAX_ANSWER_LENGTH, cleanAnswer, isAnswered, readClarifications } from "@/lib/clarificationThread";
import type { Clarification } from "@/lib/clarificationThread";
import { logError } from "@/lib/logError";

/**
 * "Answer question" on the agency banner and the request page. Agency staff only (the workspace has one agency, so any staff member
 * may answer any request's questions); every input is checked with a strict schema (security.md).
 */

export interface OpenQuestion {
  id: string;
  interpreterName: string;
  question: string;
  askedAt: string;
  beforeAccepting: boolean;
}

const ids = z.object({ requestId: z.string().uuid(), questionId: z.string().uuid().nullable().optional() });
const answerInput = z.object({
  requestId: z.string().uuid(),
  questionId: z.string().uuid(),
  answer: z.string().transform(cleanAnswer).pipe(z.string().min(1, "Write your answer.").max(MAX_ANSWER_LENGTH, `Answers can be up to ${MAX_ANSWER_LENGTH} characters.`)),
});

const toOpen = (c: Clarification): OpenQuestion => ({ id: c.id, interpreterName: c.interpreterName || "Interpreter", question: c.question, askedAt: c.askedAt, beforeAccepting: c.beforeAccepting === true });

/** The request's unanswered questions (only the named one when `questionId` is given), newest first. Staff only. */
export async function getOpenQuestions(input: { requestId: string; questionId?: string | null }): Promise<{ success: true; questions: OpenQuestion[] } | { success: false; error: string }> {
  try {
    await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = ids.safeParse(input);
  if (!parsed.success) return { success: false, error: "That question could not be found." };
  try {
    const [row] = await db.select({ data: requests.data }).from(requests).where(eq(requests.id, parsed.data.requestId)).limit(1);
    if (!row) return { success: false, error: "This request no longer exists." };
    const open = readClarifications((row.data as { clarifications?: unknown } | null)?.clarifications).filter((c) => !isAnswered(c));
    const wanted = parsed.data.questionId ? open.filter((c) => c.id === parsed.data.questionId) : open;
    return { success: true, questions: wanted.map(toOpen) };
  } catch (err) {
    logError("getOpenQuestions", err);
    return { success: false, error: "We could not load the question. Please try again." };
  }
}

/** Saves the answer, closes the staff notices for it and tells the interpreter (lib/clarificationReply.ts). */
export async function answerQuestion(input: { requestId: string; questionId: string; answer: string }): Promise<{ success: true } | { success: false; error: string }> {
  let session: Awaited<ReturnType<typeof requireRole>>;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = answerInput.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid answer." };
  try {
    const result = await answerClarification({
      ...parsed.data,
      staffName: session.user.name || "Agency staff",
      staffUserId: session.user.id,
      staffEmail: session.user.email ?? null,
    });
    if (!result.success) return result;
    revalidatePath(`/requests/${parsed.data.requestId}`);
    return { success: true };
  } catch (err) {
    logError("answerQuestion", err);
    return { success: false, error: "We could not send your answer. Please try again." };
  }
}
