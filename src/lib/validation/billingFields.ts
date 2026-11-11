import { z } from "zod";

/**
 * The two billing fields typed in Staffing: the client's date of birth and the billing modifier (U3 for medical, "U3 U9" for mental health).
 * STRICTLY AGENCY ONLY: they are stored on the job's intake, which interpreter views never copy (see interpreterJobData.ts), and they
 * are never put in an email, a link, a notification or a log. Shared by the Staffing boxes and the server actions (the real check).
 * Pure.
 */

export const DOB_FORMAT_MESSAGE = "Enter the date of birth as MM/DD/YYYY (a real date, not in the future).";
export const DOB_MAX_INPUT = 20;

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * "03/04/1985" (or "3/4/1985", or "1985-03-04") as the stored form "1985-03-04". An empty value is "" (it clears the field). Null when
 * it is not a real calendar date, has a two-digit year, is before 1900 or is after today.
 */
export function parseDob(input: string, today: Date = new Date()): string | null {
  const text = input.trim();
  if (text === "") return "";
  const us = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const [year, month, day] = us ? [Number(us[3]), Number(us[1]), Number(us[2])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [NaN, NaN, NaN];
  if (![year, month, day].every(Number.isInteger)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1900) return null;
  if (date.getTime() > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The stored "1985-03-04" as "03/04/1985" (empty when there is none or it is not a stored date). */
export function formatDob(stored: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stored ?? "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

/**
 * The two codes billing uses. Mental health is billed with BOTH modifiers, written "U3 U9" (one value, a single space). They were first
 * offered the other way round (U3 mental health, U9 medical), which was wrong; a lone "U9" is no longer a value, and a job that still has
 * one stored simply shows no selection until someone picks again.
 */
export const BILLING_MODIFIERS = ["U3", "U3 U9"] as const;
export type BillingModifier = (typeof BILLING_MODIFIERS)[number];
export const BILLING_MODIFIER_LABEL: Record<BillingModifier, string> = { U3: "U3 — Medical", "U3 U9": "U3 U9 — Mental Health" };

/** The stored modifier when it is one of the two, else "" (anything else on file is treated as not set). */
export const asBillingModifier = (value: unknown): BillingModifier | "" => (BILLING_MODIFIERS as readonly unknown[]).includes(value) ? (value as BillingModifier) : "";

export const setClientDobSchema = z.object({ requestId: z.string().uuid(), clientDob: z.string().max(DOB_MAX_INPUT) });
/** One of the two codes, or empty (or null) to clear it. Nothing else: not another code, a different case, extra spaces or the words. */
export const setBillingModifierSchema = z.object({
  requestId: z.string().uuid(),
  modifier: z.preprocess((value) => (value === null ? "" : value), z.enum(["", ...BILLING_MODIFIERS])),
});
