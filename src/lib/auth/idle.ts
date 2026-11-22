/**
 * Idle sign-out for agency staff AND interpreters (HIPAA automatic logoff): both portals sign out after the same 30 minutes
 * without activity. Pure and Edge-safe (used by the middleware, the NextAuth callbacks, the server guards and the browser), so it
 * imports nothing.
 *
 * The server decides: the signed token carries `lastActivityAt`, and a request whose token has been idle past the limit is
 * treated as signed out. The browser timer (useIdleTimeout) only gives the warning and sends "I'm still here" pings.
 * Every login is governed; the public token pages (emailed links) are not logins and are not.
 */

/** Signed out after this long without activity. */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;
/** The warning appears this long before the limit (28 minutes of inactivity). */
export const IDLE_WARNING_LEAD_MS = 2 * 60 * 1000;
/** While a person is active, the browser tells the server at most this often. */
export const IDLE_TOUCH_INTERVAL_MS = 60 * 1000;

/** `?reason=` on the sign-in pages after an idle sign-out. */
export const IDLE_LOGIN_REASON = "idle";

/** The fields of a sign-in token this module reads. */
export interface IdleTokenFields {
  role?: unknown;
  lastActivityAt?: unknown;
  /** Seconds since 1970 the token was issued: the fallback for tokens created before `lastActivityAt` existed. */
  iat?: unknown;
}

/** When this token was last active (ms since 1970), or null when it carries no usable timestamp. */
export const lastActivityOf = (token: IdleTokenFields): number | null => {
  if (typeof token.lastActivityAt === "number" && Number.isFinite(token.lastActivityAt)) return token.lastActivityAt;
  if (typeof token.iat === "number" && Number.isFinite(token.iat)) return token.iat * 1000;
  return null;
};

/** The logins the idle rule governs: each portal's own role. */
export type IdleRole = "agency" | "interpreter";

export const isIdleRole = (role: unknown): role is IdleRole => role === "agency" || role === "interpreter";

/**
 * True when this token is a login (agency or interpreter) that has been idle longer than the limit. No token, or a token with no
 * known role, is never idle-expired. A login token with no timestamp at all cannot be shown to be fresh, so it counts as expired.
 */
export const isIdleExpired = (token: IdleTokenFields | null | undefined, now: number = Date.now()): boolean => {
  if (!token || !isIdleRole(token.role)) return false;
  const last = lastActivityOf(token);
  if (last === null) return true;
  return now - last > IDLE_LIMIT_MS;
};

/** Where the browser's own idle sign-out lands: the sign-in of the portal this login belongs to (anything but an interpreter: agency). */
export const signedOutUrl = (role: unknown): string => idleLoginPath(undefined, role === "interpreter" ? "interpreter" : "agency");

/** The "still here" ping the browser sends through NextAuth's `update()`: `update({ touch: true })`. */
export const isTouchUpdate = (session: unknown): boolean =>
  typeof session === "object" && session !== null && (session as { touch?: unknown }).touch === true;

/**
 * Where an idle-expired login is sent: its own portal's sign-in (an interpreter to the interpreter sign-in, staff to the agency
 * one), with the reason and, when given, the page they were on (a same-site path only).
 */
export const idleLoginPath = (returnTo?: string, role: IdleRole = "agency"): string => {
  const query = new URLSearchParams({ reason: IDLE_LOGIN_REASON });
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) query.set("callbackUrl", returnTo);
  return `/login/${role}?${query.toString()}`;
};
