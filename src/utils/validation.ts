/**
 * Validates that a non-empty string matches standard email formatting:
 * contains a valid local part, an '@' symbol, and a domain with a dot.
 * Empty or whitespace-only values return true (valid / optional).
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email || !email.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Returns true if the string is non-empty and fails email format validation.
 */
export function isInvalidEmail(email: string | null | undefined): boolean {
  if (!email || !email.trim()) return false;
  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
