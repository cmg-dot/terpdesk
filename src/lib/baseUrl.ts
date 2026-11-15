const PRODUCTION_FALLBACK = "https://myterpdesk.com";
const DEV_FALLBACK = "http://localhost:3000";

/** Returns the origin of `value` when it is a usable http(s) URL, otherwise null. Never throws. */
const toOrigin = (value: string | undefined): string | null => {
  const text = value?.trim();
  if (!text) return null;
  try {
    // Accept "myterpdesk.com" (no scheme) the way Vercel's own VERCEL_URL / VERCEL_PROJECT_PRODUCTION_URL are written.
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
};

/**
 * Vercel's own idea of this deployment's address, used only when nothing is configured. A production deployment uses the project's
 * production domain (the shortest custom domain: myterpdesk.com for production, terpdesk-demo.vercel.app for the demo), never the
 * one-off deployment URL, which can sit behind Vercel's login wall. A preview uses its own deployment URL so its links stay on it.
 */
const vercelOrigin = (): string | null =>
  process.env.VERCEL_ENV === "production" ? toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) : toOrigin(process.env.VERCEL_URL);

/**
 * The app's public base URL, used for links in emails and as NextAuth's URL.
 * Order: NEXT_PUBLIC_APP_URL, NEXTAUTH_URL, Vercel's production domain (production) or deployment URL (preview), then a fixed
 * fallback. Every candidate is validated, so a missing or malformed variable can never reach `new URL(...)` and crash a build or a request.
 */
export const getBaseUrl = (): string =>
  toOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
  toOrigin(process.env.NEXTAUTH_URL) ??
  vercelOrigin() ??
  (process.env.NODE_ENV === "production" ? PRODUCTION_FALLBACK : DEV_FALLBACK);

/**
 * NextAuth parses NEXTAUTH_URL with `new URL(...)` whenever it handles a request, so an empty or malformed value throws "Invalid URL".
 * A valid value is trimmed to its own origin ("https://myterpdesk.com/" becomes "https://myterpdesk.com"); only a missing or malformed
 * one is replaced with `getBaseUrl()`.
 */
export const ensureValidAuthUrl = (): void => {
  const origin = toOrigin(process.env.NEXTAUTH_URL);
  if (!origin) process.env.NEXTAUTH_URL = getBaseUrl();
  else if (process.env.NEXTAUTH_URL !== origin) process.env.NEXTAUTH_URL = origin;
};
