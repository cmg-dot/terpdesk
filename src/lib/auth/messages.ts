import type { AppRole } from "@/lib/auth/routes";

/**
 * Sign-in failure messages that are safe to show verbatim on the login form. They are only ever thrown after the
 * correct password was entered (or, for the lockout, before any password is checked), so they reveal nothing about
 * which emails exist. Client-safe: no server imports.
 */
export const LOCKED_MESSAGE = "Account temporarily locked due to too many failed attempts. Try again in 15 minutes.";

/**
 * Correct email and password, but the account belongs to the other portal. Keyed by the portal that was used.
 * Thrown before a session exists, so signing in through the wrong portal never logs anyone in.
 */
export const WRONG_PORTAL_MESSAGES: Readonly<Record<AppRole, string>> = {
  agency: "This sign-in is for agency staff. Your account is an interpreter account: use the interpreter sign-in.",
  interpreter: "This sign-in is for interpreters. Your account is an agency account: use the agency sign-in.",
};

/**
 * Two-step verification. Only ever thrown after the correct password, so none of them reveals anything about other accounts.
 * REQUIRED is not an error: it is the sign-in asking for the code (the form then shows its code field).
 */
export const MFA_REQUIRED_MESSAGE = "Enter the 6-digit code from your authenticator app to finish signing in.";
export const MFA_INVALID_MESSAGE = "That code didn't work. Check your authenticator app and try again, or use a recovery code.";
export const MFA_UNAVAILABLE_MESSAGE = "Two-step verification is temporarily unavailable. Please try again shortly or contact your administrator.";

export const DISPLAYABLE_AUTH_MESSAGES: readonly string[] = [LOCKED_MESSAGE, MFA_INVALID_MESSAGE, MFA_UNAVAILABLE_MESSAGE, ...Object.values(WRONG_PORTAL_MESSAGES)];

/** Shown on the sign-in pages after an agency login was signed out for inactivity (?reason=idle). */
export const IDLE_SIGNED_OUT_MESSAGE = "You were signed out after 30 minutes of inactivity for HIPAA security.";

/** The sign-out confirmation (the modal and the /signout page). */
export const SIGN_OUT_TITLE = "Sign out of terpDESK?";
export const SIGN_OUT_TEXT = "You will need to sign in again to see your workspace.";
