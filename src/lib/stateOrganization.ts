import type { FormExtras } from "@/lib/odhhFormFields";

/**
 * The organization a state request is for: the form's "Billing Organization Name", or, when that is blank, its "Requestor Location"
 * when that names an organization rather than a city ("Seattle Children's Hospital", not "Olympia"). On the production forms the
 * Requestor Location is a city about 9 times in 10; when it holds an organization word and a billing organization is also given, the
 * two are the same name in 19 of 23 forms. Pure.
 */

const ORGANIZATION_WORDS =
  /\b(?:hospital|clinic|center|centre|medical|health|healthcare|university|college|school|district|department|dept|services|court|courts|office|division|agency|dshs|dvr|dsb|odhh|hca|l&i|county|foundation|academy|institute|library|children'?s|inc|llc)\b/i;

/** "Seattle Children's Hospital" yes; "Olympia", "Tacoma, WA" no. */
export const looksLikeOrganization = (value: string | null | undefined): boolean => {
  const text = (value ?? "").trim();
  return text.length >= 3 && text.length <= 120 && ORGANIZATION_WORDS.test(text);
};

/** The parent organization the form names, or null when it names none. */
export function parentOrganization(extras: Pick<FormExtras, "billingOrganization" | "requestorLocation">): string | null {
  if (extras.billingOrganization) return extras.billingOrganization;
  return looksLikeOrganization(extras.requestorLocation) ? (extras.requestorLocation ?? "").trim() : null;
}
