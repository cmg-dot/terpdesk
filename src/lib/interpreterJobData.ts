/**
 * The request `data` an interpreter's browser is allowed to receive. The raw object holds staff-only material
 * (agency-private notes, the original forwarded email, requester/billing details, other interpreters' questions and
 * hours, program access codes), so the interpreter feed must pass it through here instead of returning it whole.
 *
 * Denylist on purpose: the interpreter pages read schedule, `details`, `onsite`, the program and SRN from this object,
 * and everything else stays as before. Add a key here whenever staff-only data is added to `requests.data`.
 */

type Loose = Record<string, unknown>;

const isObject = (v: unknown): v is Loose => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Top-level keys that are staff-only or belong to other interpreters. */
const STAFF_ONLY_KEYS = [
  "privateNotes", // "Agency-private notes"
  "source", // the original forwarded email (incl. client details and contractor-only text)
  "requester", // requester and billing contact
  "clarifications", // every interpreter's questions
  "hoursSubmissions", // both positions' hours (own hours are sent separately)
  "hoursSubmission",
  "offers", // cached offers naming other interpreters
  "slots",
  "assignedInterpreterId",
  "assignedInterpreterName",
  "position2InterpreterId",
  "position2InterpreterName",
  "detailsUpdate",
  "serviceVerification", // the state's receipt (times, miles, fees)
] as const;

/** `intake` keys that staff must never share (the ODHH access code is "never shown to interpreters"). */
const STAFF_ONLY_INTAKE_KEYS = ["odhhAccessCode", "providerOneNumber"] as const;

/** `details` keys kept off interpreter screens. */
const STAFF_ONLY_DETAILS_KEYS = ["clientGender"] as const;

const without = (source: Loose, keys: readonly string[]): Loose => {
  const copy: Loose = { ...source };
  for (const key of keys) delete copy[key];
  return copy;
};

export function interpreterSafeData(data: unknown): Loose {
  if (!isObject(data)) return {};
  const safe = without(data, STAFF_ONLY_KEYS);
  if (isObject(safe.intake)) safe.intake = without(safe.intake, STAFF_ONLY_INTAKE_KEYS);
  if (isObject(safe.details)) safe.details = without(safe.details, STAFF_ONLY_DETAILS_KEYS);
  return safe;
}

/** The same for a `details` object returned on its own. */
export function interpreterSafeDetails(details: unknown): Loose {
  return isObject(details) ? without(details, STAFF_ONLY_DETAILS_KEYS) : {};
}
