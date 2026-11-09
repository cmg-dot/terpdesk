/**
 * Voiding a job: it should never have been a job (the wrong form was sent, it is a duplicate, the state voided it). A voided
 * job is closed like a cancelled one (so every screen, cron and filter that skips cancelled jobs skips it) and is marked
 * `data.void` so it keeps its own badge and filter. Pure: safe in client components.
 *
 * "Unable to fill" is the fifth reason: the job was real, but the agency could not staff it and returned it to the state or
 * the requester. It shares the closing machinery (so it disappears from the dashboard and is not billed) but is NOT a void
 * to staff: it has its own button, badge, activity wording and "Returned" filter.
 */

/** The reasons offered by the "Void job" button. */
export const MANUAL_VOID_KINDS = ["wrong_form", "duplicate", "state_void", "other"] as const;
/** The fifth reason, recorded only by the "Unable to fill" button (see actions/returnUnfilledJob.ts). */
export const RETURNED_KIND = "unable_to_fill" as const;
export const VOID_KINDS = [...MANUAL_VOID_KINDS, RETURNED_KIND] as const;
export type VoidKind = (typeof VOID_KINDS)[number];

export const VOID_LABELS: Record<VoidKind, string> = {
  wrong_form: "Wrong form sent",
  duplicate: "Duplicate request",
  state_void: "Voided by the state",
  other: "Other reason",
  unable_to_fill: "Unable to fill / returned to state",
};

export interface VoidRecord {
  at: string;
  /** The staff login that voided it (an id, never a name). */
  by: string | null;
  kind: VoidKind;
  note: string | null;
  /** Only for "unable to fill": staff ticked that the job was also returned in the state's portal (state jobs). */
  portalReturned?: boolean;
}

const voidRecordOf = (data: unknown): Partial<VoidRecord> | null => {
  const record = (data as { void?: unknown } | null | undefined)?.void;
  return typeof record === "object" && record !== null ? (record as Partial<VoidRecord>) : null;
};

/** True when the request's data carries a close-out record (a void OR an "unable to fill"). Used by the closing machinery. */
export const isVoidedData = (data: unknown): boolean => voidRecordOf(data) !== null;

/** True when the job was closed as "unable to fill / returned to state". */
export const isReturnedData = (data: unknown): boolean => voidRecordOf(data)?.kind === RETURNED_KIND;

/** True for a real void (wrong form, duplicate, state void, other): the "Voided" badge and filter. A returned job is not one. */
export const isPlainVoidData = (data: unknown): boolean => isVoidedData(data) && !isReturnedData(data);

/** Whether a returned job was also returned in the state's portal (null when it was not a return, or was never recorded). */
export const returnedInPortal = (data: unknown): boolean | null => {
  const record = voidRecordOf(data);
  return record?.kind === RETURNED_KIND ? record.portalReturned === true : null;
};

/** "Void: Wrong form sent: the note" / "Unable to fill / returned to state: the note", the text kept as the cancel reason. */
export const voidReasonText = (kind: VoidKind, note: string | null): string =>
  `${kind === RETURNED_KIND ? "" : "Void: "}${VOID_LABELS[kind]}${note ? `: ${note}` : ""}`;
