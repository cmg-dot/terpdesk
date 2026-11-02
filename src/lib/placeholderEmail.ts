/**
 * Interpreters need an email in the database (it is NOT NULL and the unique key), but some bulk-import rows have none.
 * Those people get a stable placeholder address on a reserved domain: ".invalid" can never be delivered (RFC 2606), so
 * nothing is ever sent to a stranger, and the same person always gets the same placeholder, so re-importing the file
 * finds them instead of creating a duplicate. Pure: safe to import from client components.
 */

export const PLACEHOLDER_EMAIL_DOMAIN = "no-email.invalid";

/** `digest` is a hex hash of the person's normalized name (hashing happens server-side). */
export const placeholderEmailFor = (digest: string): string => `no-email-${digest.slice(0, 16)}@${PLACEHOLDER_EMAIL_DOMAIN}`;

export const isPlaceholderEmail = (email: string | null | undefined): boolean =>
  typeof email === "string" && email.trim().toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
