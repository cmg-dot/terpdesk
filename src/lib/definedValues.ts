/**
 * A copy of an object without its `undefined` values. Merging a form's values onto a saved record with
 * `{ ...saved, ...fromForm }` lets `{ odhhSrn: undefined }` replace a saved SRN (the key then drops out when the record is
 * stored as JSON). Merge `definedOnly(fromForm)` instead, so a field the form did not send keeps what is on file. An
 * empty string is a real value (staff cleared the field) and is kept.
 */
export function definedOnly<T extends Record<string, unknown>>(source: T | null | undefined): Partial<T> {
  const kept: Partial<T> = {};
  for (const key of Object.keys(source ?? {}) as (keyof T)[]) {
    const value = source?.[key];
    if (value !== undefined) kept[key] = value;
  }
  return kept;
}
