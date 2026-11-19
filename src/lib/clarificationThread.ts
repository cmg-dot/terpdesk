/**
 * The questions interpreters ask about a job (`requests.data.clarifications`) and the agency's answers to them. Pure: safe in client
 * components (the banner and the request page read the same rules). The answer itself is stored on the question and, for the
 * interpreter, as an agency message (lib/clarificationReply.ts); it never goes in an email or a notification text.
 */

export interface Clarification {
  id: string;
  interpreterId?: string;
  interpreterName?: string;
  question: string;
  askedAt: string;
  /** Asked on a pending offer, before the interpreter accepted or declined. */
  beforeAccepting?: boolean;
  answer?: string;
  answeredAt?: string;
  answeredBy?: string;
}

export const MAX_ANSWER_LENGTH = 1000;

export const isClarification = (value: unknown): value is Clarification => {
  const c = value as Partial<Clarification> | null;
  return Boolean(c && typeof c.id === "string" && typeof c.question === "string" && typeof c.askedAt === "string");
};

export const isAnswered = (c: Clarification): boolean => typeof c.answer === "string" && c.answer.trim() !== "";

/** The questions on a request, newest first (anything malformed is skipped). */
export const readClarifications = (value: unknown): Clarification[] =>
  (Array.isArray(value) ? value.filter(isClarification) : []).sort((a, b) => Date.parse(b.askedAt) - Date.parse(a.askedAt));

/** Where a staff notice about one question opens: the request page, on that question. */
export const questionHref = (requestId: string, questionId: string): string => `/requests/${requestId}?question=${encodeURIComponent(questionId)}#questions`;

/** The request (and the question, when the notice names one) a staff notice's link points at; null for any other link. */
export function parseQuestionHref(href: string | null | undefined): { requestId: string; questionId: string | null } | null {
  const match = /^\/requests\/([0-9a-f-]{36})(?:\?question=([0-9a-f-]{36}))?(?:#questions)?$/i.exec((href ?? "").trim());
  return match ? { requestId: match[1], questionId: match[2] ?? null } : null;
}

export type AnswerOutcome =
  | { ok: true; clarifications: Clarification[]; answered: Clarification; stillOpen: number }
  | { ok: false; error: string };

/**
 * The request's questions with this one answered. Refuses an unknown question and one already answered (a second reply is a new
 * message, not an edit of what the interpreter already read). `answer` is already cleaned and length-checked by the caller.
 */
export function withAnswer(value: unknown, questionId: string, answer: string, answeredBy: string, at: Date): AnswerOutcome {
  const raw = Array.isArray(value) ? value : [];
  const index = raw.findIndex((item) => isClarification(item) && item.id === questionId);
  if (index < 0) return { ok: false, error: "That question is no longer on this request." };
  const current = raw[index] as Clarification;
  if (isAnswered(current)) return { ok: false, error: "This question was already answered." };
  const answered: Clarification = { ...current, answer, answeredAt: at.toISOString(), answeredBy };
  const next = raw.map((item, i) => (i === index ? answered : item));
  const stillOpen = next.filter((item) => isClarification(item) && !isAnswered(item)).length;
  return { ok: true, clarifications: next as Clarification[], answered, stillOpen };
}

/** Strips control characters (keeping line breaks) and trims. */
export const cleanAnswer = (value: string): string => value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim();
