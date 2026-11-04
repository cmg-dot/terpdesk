/**
 * Voiding a job: it should never have been a job (the wrong form was sent, it is a duplicate, the state voided it). A voided
 * job is closed like a cancelled one (so every screen, cron and filter that skips cancelled jobs skips it) and is marked
 * `data.void` so it keeps its own badge and filter. Pure: safe in client components.
 */

export const VOID_KINDS = ["wrong_form", "duplicate", "state_void", "other"] as const;
export type VoidKind = (typeof VOID_KINDS)[number];

export const VOID_LABELS: Record<VoidKind, string> = {
  wrong_form: "Wrong form sent",
  duplicate: "Duplicate request",
  state_void: "Voided by the state",
  other: "Other reason",
};

export interface VoidRecord {
  at: string;
  /** The staff login that voided it (an id, never a name). */
  by: string | null;
  kind: VoidKind;
  note: string | null;
}

/** True when the request's data carries a void record. */
export const isVoidedData = (data: unknown): boolean => {
  const record = (data as { void?: unknown } | null | undefined)?.void;
  return typeof record === "object" && record !== null;
};

/** "Void: Wrong form sent: the note", the text kept as the cancel reason. */
export const voidReasonText = (kind: VoidKind, note: string | null): string => `Void: ${VOID_LABELS[kind]}${note ? `: ${note}` : ""}`;
