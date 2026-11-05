/**
 * How a pending state job reads in the "Log State Job Hours" picker. Pure, so the dialog and the tests share one rule:
 * the state's SRN first (what the dispatcher has in hand), then the date and the interpreter.
 */

export interface StateJobOptionSource {
  /** "SRN #202786433", or the short APT reference for a job that has no SRN. */
  reference: string;
  dateLabel: string;
  interpreterName: string;
  /** "9:00 AM – 10:30 AM PST" in the job's own zone. */
  timeLabel: string;
  /** Who the job is for, or null when none is on file. */
  organization: string | null;
}

/** "SRN #202786433 · Nov 4, 2026 · Grant Fulwiler". */
export const stateJobOptionLabel = (job: StateJobOptionSource): string => `${job.reference} · ${job.dateLabel} · ${job.interpreterName}`;

/** The second line, searched too: "9:00 AM – 10:30 AM PST · Seattle Children's". */
export const stateJobOptionDescription = (job: StateJobOptionSource): string => [job.timeLabel, job.organization].filter(Boolean).join(" · ");
