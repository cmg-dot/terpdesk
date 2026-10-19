/**
 * Sign-in failure messages that are safe to show verbatim on the login form. They are only ever thrown after the
 * correct password was entered (or, for the lockout, before any password is checked), so they reveal nothing about
 * which emails exist. Client-safe: no server imports.
 */
export const LOCKED_MESSAGE = "Account temporarily locked due to too many failed attempts. Try again in 15 minutes.";

export const DISPLAYABLE_AUTH_MESSAGES: readonly string[] = [LOCKED_MESSAGE];
