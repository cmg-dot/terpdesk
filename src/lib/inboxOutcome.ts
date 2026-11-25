/**
 * What the app did about an incoming email, in words for the inbox row (the outcome is saved on the email when it arrives: see
 * inboundMail/handle.ts and inboxFormIngest.ts). `tone` picks the chip's colour: done (the job changed), attention (a person has to
 * act), quiet (nothing needed doing). An outcome this file does not know shows nothing rather than a guess. Pure.
 */

export type OutcomeTone = "done" | "attention" | "quiet";

const OUTCOMES: Record<string, { label: string; tone: OutcomeTone }> = {
  cancelled: { label: "Job cancelled", tone: "done" },
  voided: { label: "Job voided", tone: "done" },
  created: { label: "Job created", tone: "done" },
  filled: { label: "Job updated from form", tone: "done" },
  noted: { label: "Noted on job", tone: "done" },
  link_applied: { label: "Meeting link added", tone: "done" },
  link_held: { label: "Held: check the link", tone: "attention" },
  link_review: { label: "Check the link", tone: "attention" },
  link_kept: { label: "Link already on job", tone: "quiet" },
  cancel_held: { label: "Held: check the job", tone: "attention" },
  void_held: { label: "Held: check the job", tone: "attention" },
  flagged_cancel: { label: "Confirm on the job", tone: "attention" },
  reply_needs_look: { label: "Check this reply", tone: "attention" },
  no_job: { label: "No job yet", tone: "attention" },
  failed: { label: "Could not process", tone: "attention" },
  already_closed: { label: "Job already closed", tone: "quiet" },
  ignored_reply: { label: "Reply: no action", tone: "quiet" },
  ignored: { label: "No action", tone: "quiet" },
  unchanged: { label: "No change", tone: "quiet" },
  skipped: { label: "No action", tone: "quiet" },
  returned: { label: "Job returned", tone: "done" },
  unable_held: { label: "Held: check the job", tone: "attention" },
  hours_report: { label: "Hours report", tone: "quiet" },
  hours_no_job: { label: "Hours: no job found", tone: "attention" },
  notice_only: { label: "State notice: no action", tone: "quiet" },
};

export const outcomeView = (outcome: string | null | undefined): { label: string; tone: OutcomeTone } | null => (outcome ? OUTCOMES[outcome] ?? null : null);
