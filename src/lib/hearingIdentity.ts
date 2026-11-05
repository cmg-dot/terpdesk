import type { HearingIdentity } from "@/db/schema";

/** The hearing identity choices the request forms offer, and the state form's own wording read as one of them. Pure. */

export const HEARING_IDENTITY_OPTIONS: { value: HearingIdentity | ""; label: string }[] = [
  { value: "", label: "Not specified" },
  { value: "deaf", label: "Deaf" },
  { value: "hard of hearing", label: "Hard of hearing" },
  { value: "deafblind", label: "DeafBlind" },
  { value: "late_deafened", label: "Late-deafened" },
  { value: "other", label: "Other" },
];

const squash = (value: string): string => value.toLowerCase().replace(/[^a-z]/g, "");

/** "Deaf", "Hard of Hearing", "DeafBlind", "Late-Deafened" (the state's wording) as the stored value; "" when blank. */
export function identityFromText(value: string): HearingIdentity | "" {
  const s = squash(value);
  if (!s || s === "na" || s === "none" || s === "notspecified") return "";
  if (s === "deaf") return "deaf";
  if (s === "hardofhearing" || s === "hh" || s === "hoh") return "hard of hearing";
  if (s === "deafblind") return "deafblind";
  if (s === "latedeafened") return "late_deafened";
  return "other";
}

/** The label for a stored value; "" when none is chosen (so a blank never reads as the "Not specified" choice). */
export const identityLabel = (value: string): string => (value ? HEARING_IDENTITY_OPTIONS.find((o) => o.value === value)?.label ?? "" : "");

/** A stored value as a choice: an allowed value as is, anything else read like the state's wording. */
export function identityValue(raw: unknown): HearingIdentity | "" {
  const value = typeof raw === "string" ? raw.trim() : "";
  return HEARING_IDENTITY_OPTIONS.some((o) => o.value === value) ? (value as HearingIdentity | "") : identityFromText(value);
}
