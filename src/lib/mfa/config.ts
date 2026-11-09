/**
 * Two-step verification settings, read from the environment at call time. SERVER ONLY.
 *
 *   MFA_ENABLED         "false" turns the whole feature off: the Settings card disappears and an enrolled login is NOT asked for a
 *                       code (each such sign-in is audited as mfa_skipped_flag_off). Anything else, or unset, leaves it on.
 *                       It is an operator's emergency switch, not a per-user setting: enrolment itself is always opt-in.
 *   MFA_ENCRYPTION_KEY  32 random bytes, base64. Seals the authenticator secrets. Without it nobody can enrol, and an
 *                       already-enrolled login cannot be verified, so it is refused rather than let in.
 */

/** The name an authenticator app shows beside the account. */
export const MFA_ISSUER = "terpDESK (ASL Professionals)";

export const mfaFeatureEnabled = (): boolean => (process.env.MFA_ENABLED ?? "true").trim().toLowerCase() !== "false";

/** The 32-byte key, or null when it is missing or the wrong size. */
export const mfaKey = (): Buffer | null => {
  const raw = process.env.MFA_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
};

export const mfaConfigured = (): boolean => mfaKey() !== null;
