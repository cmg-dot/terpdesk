/**
 * The cancellation form an interpreter already filed, read from their own copy of the job's hours (`hoursSubmission`, which the browser
 * receives for their own position only). Pure: the shape is checked, never assumed.
 */

export interface FiledCancellation {
  submittedAt: string;
  /** ISO instants, or "" when no travel was given. */
  travelStart: string;
  travelEnd: string;
  /** The cancellation note. */
  note: string;
  version: number;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function readFiledCancellation(hoursSubmission: unknown): FiledCancellation | null {
  if (typeof hoursSubmission !== "object" || hoursSubmission === null) return null;
  const h = hoursSubmission as Record<string, unknown>;
  if (h.cancellationForm !== true) return null;
  const version = typeof h.version === "number" && Number.isFinite(h.version) ? h.version : 1;
  return { submittedAt: text(h.submittedAt), travelStart: text(h.travelStartTime), travelEnd: text(h.travelEndTime), note: text(h.cancellationReason), version };
}
