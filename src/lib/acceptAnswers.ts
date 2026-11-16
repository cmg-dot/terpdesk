import { z } from "zod";

/**
 * What an interpreter answers when accepting an offer, in the app and on the email link's confirm page alike: "Do you need travel
 * time?" (required: yes with hours and minutes, or no) and an optional partial-availability note ("Available 10:00-11:00 AM only").
 * Accepting still books the interpreter as before; staff see the answers on the Staffing panel and the "accepted" banner. Pure; the
 * same parse runs in the browser (to fail fast) and on the server (the one that counts).
 */

export const MAX_TRAVEL_MINUTES = 24 * 60;
export const MAX_AVAILABILITY_NOTE = 500;

/** The form's raw values: strings, as a form posts them. */
export interface AcceptAnswersInput {
  travel?: string;
  travelHours?: string;
  travelMinutes?: string;
  availabilityNote?: string;
}

export interface AcceptAnswers {
  travelRequested: boolean;
  /** Total minutes asked for; 0 when no travel time is needed. */
  travelMinutes: number;
  /** "" when none was given. */
  availabilityNote: string;
}

const WHOLE = /^\d{0,4}$/;
const schema = z.object({
  travel: z.enum(["yes", "no"], { errorMap: () => ({ message: "Please answer whether you need travel time." }) }),
  travelHours: z.string().trim().regex(WHOLE, "Use whole hours.").default(""),
  travelMinutes: z.string().trim().regex(WHOLE, "Use whole minutes.").default(""),
  availabilityNote: z.string().default(""),
});

export type AcceptAnswersParse = { ok: true; answers: AcceptAnswers } | { ok: false; error: string };

export function parseAcceptAnswers(input: unknown): AcceptAnswersParse {
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  const { travel, travelHours, travelMinutes, availabilityNote } = parsed.data;
  // Control characters out, line breaks kept as spaces: the note is shown on one line to staff.
  const note = availabilityNote.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
  if (note.length > MAX_AVAILABILITY_NOTE) return { ok: false, error: `The availability note can be up to ${MAX_AVAILABILITY_NOTE} characters.` };
  if (travel === "no") return { ok: true, answers: { travelRequested: false, travelMinutes: 0, availabilityNote: note } };

  const h = travelHours ? Number(travelHours) : 0;
  const m = travelMinutes ? Number(travelMinutes) : 0;
  if (m > 59) return { ok: false, error: "Minutes must be 59 or less." };
  const total = h * 60 + m;
  if (total < 1) return { ok: false, error: "Enter how much travel time you need." };
  if (total > MAX_TRAVEL_MINUTES) return { ok: false, error: "Travel time can be at most 24 hours." };
  return { ok: true, answers: { travelRequested: true, travelMinutes: total, availabilityNote: note } };
}

/** The offer columns the answers are saved in (0012_phase23.sql). */
export const offerAnswerColumns = (a: AcceptAnswers) => ({
  travelRequested: a.travelRequested,
  travelMinutes: a.travelRequested ? a.travelMinutes : null,
  availabilityNote: a.availabilityNote || null,
});
