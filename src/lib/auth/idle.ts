/**
 * Idle sign-out for agency staff (HIPAA automatic logoff). Pure and Edge-safe (used by the middleware, the NextAuth callbacks,
 * the server guards and the browser), so it imports nothing.
 *
 * The server decides: the signed token carries `lastActivityAt`, and a request whose token has been idle past the limit is
 * treated as signed out. The browser timer (useIdleTimeout) only gives the warning and sends "I'm still here" pings.
 * Only agency logins are governed; interpreters and the public token pages are not.
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

/**
 * True when this token is an agency login that has been idle longer than the limit. Anyone else (interpreters, no token) is
 * never idle-expired. An agency token with no timestamp at all cannot be shown to be fresh, so it counts as expired.
 */
export const isIdleExpired = (token: IdleTokenFields | null | undefined, now: number = Date.now()): boolean => {
  if (!token || token.role !== "agency") return false;
  const last = lastActivityOf(token);
  if (last === null) return true;
  return now - last > IDLE_LIMIT_MS;
};

/** The "still here" ping the browser sends through NextAuth's `update()`: `update({ touch: true })`. */
export const isTouchUpdate = (session: unknown): boolean =>
  typeof session === "object" && session !== null && (session as { touch?: unknown }).touch === true;

/** Where an idle-expired agency login is sent: the agency sign-in, with the reason and the page they were on. */
export const idleLoginPath = (returnTo?: string): string => {
  const query = new URLSearchParams({ reason: IDLE_LOGIN_REASON });
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) query.set("callbackUrl", returnTo);
  return `/login/agency?${query.toString()}`;
};
