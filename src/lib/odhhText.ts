/** Small text helpers shared by the ODHH email parsers (pure). Kept apart so the location parser and the main parser can both use them. */

export const MAX_FIELD_LENGTH = 300;

/** A form value that means "nothing": "N/A", "None", "No", "-". */
export const EMPTY_VALUE = /^(?:n\/?a|none|no|not applicable|not provided|-+)$/i;

/** The value with its spacing squashed and its length capped; null when nothing is left. */
export function cleanValue(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, MAX_FIELD_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}
