/**
 * The appointment notes an interpreter sees on a PENDING offer, before accepting. The notes are free text (typed by staff, or the
 * state form's "Appointment Note" on an ODHH job), so they are scrubbed on the server before they leave it: the job's client name
 * (in full and each part of it), the client's date of birth, the WA # / ProviderOne number, the prior-authorization number, any
 * date of birth or WA # written in the text, phone numbers, email addresses and every run of 7 or more digits. What is removed
 * reads "[removed]". A booked interpreter keeps receiving the notes as written (interpreterJobData.ts). Pure.
 */

export const REMOVED = "[removed]";

export interface NoteSecrets {
  /** details.deafParticipant */
  clientName?: string | null;
  /** intake.clientDob, stored yyyy-MM-dd */
  clientDob?: string | null;
  /** intake.providerOneNumber */
  providerOne?: string | null;
  /** intake.priorAuthNumber */
  priorAuth?: string | null;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A literal anywhere in the text, case-insensitive, as a whole word when it starts and ends with a letter or digit. */
const literal = (value: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])${escape(value)}(?![\\p{L}\\p{N}])`, "giu");

/** The ways a stored yyyy-MM-dd date of birth is commonly written: 05/09/1991, 5/9/1991, 5/9/91, 05-09-1991, 1991-05-09. */
function dobForms(stored: string): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stored.trim());
  if (!m) return [];
  const [, y, mm, dd] = m;
  const months = [mm, String(Number(mm))];
  const days = [dd, String(Number(dd))];
  const years = [y, y.slice(2)];
  const out = new Set<string>([stored.trim()]);
  for (const mo of months) for (const d of days) for (const yr of years) for (const sep of ["/", "-", "."]) out.add(`${mo}${sep}${d}${sep}${yr}`);
  return Array.from(out).sort((a, b) => b.length - a.length);
}

/** The client's name and each part of it (two letters or more), longest first so the full name goes before its parts. */
function nameForms(name: string): string[] {
  const full = name.trim().replace(/\s+/g, " ");
  if (!full) return [];
  const notLetter = new RegExp("[^\\p{L}]", "gu");
  const parts = full.split(/[\s,]+/).filter((p) => p.replace(notLetter, "").length >= 2);
  return Array.from(new Set([full, ...parts])).sort((a, b) => b.length - a.length);
}

/** Patterns that are never sent before acceptance, whoever the client is. Order matters: labelled values first. */
const GENERIC: RegExp[] = [
  // "DOB: 5/9/91", "D.O.B 05-09-1991", "date of birth 1991-05-09"
  /\b(?:d\.?\s?o\.?\s?b\.?|date\s+of\s+birth|birth\s?date)\s*[:#-]?\s*\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/gi,
  // A WA # / ProviderOne id: nine digits and "WA"
  /\b\d{9}\s?WA\b/gi,
  // Email addresses
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  // Phone numbers: (253) 555-0100, 253-555-0100, 253.555.0100, +1 253 555 0100
  /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g,
  // Any run of 7 or more digits (ids, case and account numbers)
  /\d{7,}/g,
];

/** The notes as a pending offer may show them; "" when nothing readable is left. */
export function sanitizeOfferNotes(notes: string | null | undefined, secrets: NoteSecrets = {}): string {
  let text = typeof notes === "string" ? notes : "";
  if (!text.trim()) return "";
  const specific = [
    ...dobForms(secrets.clientDob ?? ""),
    ...[secrets.providerOne, secrets.priorAuth].map((v) => (v ?? "").trim()).filter((v) => v.length >= 3),
    ...nameForms(secrets.clientName ?? ""),
  ];
  for (const value of specific) text = text.replace(literal(value), REMOVED);
  for (const pattern of GENERIC) text = text.replace(pattern, REMOVED);
  // "[removed] [removed]" (a full name hit part by part) reads as one removal.
  text = text.replace(new RegExp(`${escape(REMOVED)}(?:[\\s,]+${escape(REMOVED)})+`, "g"), REMOVED);
  const left = text.replace(new RegExp(escape(REMOVED), "g"), "").replace(/[\s.,;:()-]/g, "");
  return left ? text.trim() : "";
}
