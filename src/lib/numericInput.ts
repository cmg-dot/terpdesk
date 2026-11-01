/**
 * What a decimal-number text box may hold: digits and at most one ".". Everything else (letters, "e", "+", "-", spaces,
 * punctuation, a second ".") is dropped as it is typed or pasted. Used instead of `type="number"`, which lets some
 * browsers accept letters and "e".
 */
export function sanitizeDecimal(value: string): string {
  const kept = value.replace(/[^0-9.]/g, "");
  const firstDot = kept.indexOf(".");
  return firstDot === -1 ? kept : kept.slice(0, firstDot + 1) + kept.slice(firstDot + 1).replace(/\./g, "");
}
