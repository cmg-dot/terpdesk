/**
 * What an agency may NOT change while an interpreter is booked: the time zone and the program. Switching the program breaks
 * program-specific routing (ODHH / Apple Health reporting), and switching the zone would move every time without anyone choosing a new
 * one. The date and the start and end times CAN change before the appointment starts (offerLock.ts keeps the whole job locked once it
 * has started, or while an offer is waiting); the new times are checked against every booked interpreter's other bookings and busy
 * time first (bookedTimeEdit.ts), and they are told (jobUpdateNotice.ts). Location, contact, notes, meeting access and credentials
 * stay editable.
 *
 * The edit forms disable these fields; this is the server-side guarantee, so a crafted request can't get around it.
 * It removes the locked fields from the payload, so every later step falls back to the stored values.
 */

export const LOCKED_WHILE_BOOKED = ["timeZone", "timezone"] as const;

type Loose = Record<string, unknown>;

const isObject = (v: unknown): v is Loose => Boolean(v) && typeof v === "object" && !Array.isArray(v);

const without = (source: Loose, keys: readonly string[]): Loose => {
  const copy: Loose = { ...source };
  for (const key of keys) delete copy[key];
  return copy;
};

/** Returns a copy of an edit payload with the time zone and program fields removed. */
export function stripLockedFields<T extends object>(input: T): T {
  const payload = input as Loose;
  const result: Loose = without(payload, [...LOCKED_WHILE_BOOKED, "program"]);
  if (isObject(payload.details)) result.details = without(payload.details, LOCKED_WHILE_BOOKED);
  if (isObject(payload.overview)) result.overview = without(payload.overview, LOCKED_WHILE_BOOKED);
  if (isObject(payload.intake)) result.intake = without(payload.intake, ["program"]);
  if (isObject(payload.data)) {
    const data = without(payload.data, LOCKED_WHILE_BOOKED);
    if (isObject(payload.data.intake)) data.intake = without(payload.data.intake, ["program"]);
    if (isObject(payload.data.details)) data.details = without(payload.data.details, LOCKED_WHILE_BOOKED);
    result.data = data;
  }
  return result as T;
}

export const MAX_INTERPRETER_MESSAGE = 1000;

/** The optional "Message to interpreter": trimmed, bounded, empty becomes undefined. */
export function cleanInterpreterMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\r\n/g, "\n").trim().slice(0, MAX_INTERPRETER_MESSAGE);
  return text || undefined;
}
