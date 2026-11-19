/**
 * The client's WA # (ProviderOne number), stored as `intake.providerOneNumber`. The standard form is nine digits and "WA"
 * ("123456789WA"); anything else is still accepted (the state has edge-case ids) and only flagged. STRICTLY AGENCY ONLY: a
 * Medicaid client identifier, never sent to interpreters, put in an email, a link, a notification or a log. Pure.
 */

export const PROVIDER_ONE_MAX = 40;

const STANDARD = /^\d{9}WA$/;

/** " 1234-5678 9wa " -> "123456789WA": trimmed, upper-case, without spaces or hyphens. */
export const normalizeProviderOne = (input: string): string => input.trim().toUpperCase().replace(/[\s-]+/g, "");

export const isStandardProviderOne = (value: string): boolean => STANDARD.test(value);

/** The inline note for a value that is not the standard form (null when it is, or when the box is empty). */
export const providerOneWarning = (input: string): string | null => {
  const value = normalizeProviderOne(input);
  return value === "" || isStandardProviderOne(value) ? null : "Not the usual format (9 digits + WA). It can still be saved.";
};

/**
 * The number on the state's request form ("Provider One #123456789WA", "Provider One # 123456789wa"), normalized, or null.
 * Only a value ending in WA is read, so a date that sometimes sits on that line is never taken for it. Some copies run the next
 * label straight on ("…789WAGender: Female"), so the value ends at WA unless a lower-case letter or digit follows.
 */
export function providerOneFromStateText(text: string | null | undefined): string | null {
  const match = /[Pp]rovider\s*[Oo]ne\s*#?\s*:?\s*(\d[\d\s-]{7,14}\s*[Ww][Aa])(?![a-z0-9])/.exec(text ?? "");
  if (match) return normalizeProviderOne(match[1]);
  return unlabelledProviderOne(text ?? "");
}

/**
 * The number written without its "Provider One" label ("... ID: 123456789WA"): accepted only in the standard shape, 9 digits
 * then WA as one token, and only when the text holds exactly one such number (two different ones could be two people).
 */
function unlabelledProviderOne(text: string): string | null {
  const found = new Set(Array.from(text.matchAll(/(?<![\dA-Za-z])(\d{9})[ \t]?WA(?![A-Za-z0-9])/gi), (m) => `${m[1]}WA`));
  return found.size === 1 ? normalizeProviderOne(Array.from(found)[0]) : null;
}
