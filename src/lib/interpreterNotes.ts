import { z } from "zod";

/**
 * The agency's pinned booking notes for the interpreters on a job ("Team: Christy arrives at 9:45, Ralph takes the second half"),
 * kept in requests.data.interpreterNotes. Written from Staffing; shown only to interpreters who are BOOKED on the job (the app's job
 * page and the secure job-details page), never on an offer and never in an email. Pure.
 */

export const INTERPRETER_NOTES_MAX = 2000;

export interface InterpreterNotes {
  text: string;
  /** When staff last saved them (ISO). */
  updatedAt: string;
}

export const setInterpreterNotesSchema = z.object({
  requestId: z.string().uuid(),
  // Control characters out, line breaks kept.
  text: z.string().transform((v) => v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ").trim()).pipe(z.string().max(INTERPRETER_NOTES_MAX)),
});

/** The notes saved on a job's data, or null when there are none. */
export function readInterpreterNotes(data: unknown): InterpreterNotes | null {
  const raw = data && typeof data === "object" ? (data as { interpreterNotes?: unknown }).interpreterNotes : undefined;
  if (!raw || typeof raw !== "object") return null;
  const { text, updatedAt } = raw as { text?: unknown; updatedAt?: unknown };
  return typeof text === "string" && text.trim() ? { text: text.trim(), updatedAt: typeof updatedAt === "string" ? updatedAt : "" } : null;
}
