const PRODUCTION_FALLBACK = "https://terpdesk.vercel.app";
const DEV_FALLBACK = "http://localhost:3000";

/** Returns the origin of `value` when it is a usable http(s) URL, otherwise null. Never throws. */
const toOrigin = (value: string | undefined): string | null => {
  const text = value?.trim();
  if (!text) return null;
  try {
    // Accept "terpdesk.vercel.app" (no scheme) the way Vercel's own VERCEL_URL is written.
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
};

/**
 * The app's public base URL, used for links in emails and as NextAuth's URL.
 * Order: NEXT_PUBLIC_APP_URL, NEXTAUTH_URL, VERCEL_URL, then a fixed fallback. Every candidate is validated, so a
 * missing or malformed variable can never reach `new URL(...)` and crash a build or a request.
 */
export const getBaseUrl = (): string =>
  toOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
  toOrigin(process.env.NEXTAUTH_URL) ??
  toOrigin(process.env.VERCEL_URL) ??
  (process.env.NODE_ENV === "production" ? PRODUCTION_FALLBACK : DEV_FALLBACK);

/**
 * NextAuth parses NEXTAUTH_URL with `new URL(...)` whenever it handles a request, so an empty or malformed value
 * throws "Invalid URL". Replace a bad value with a valid one before NextAuth reads it.
 */
export const ensureValidAuthUrl = (): void => {
  if (!toOrigin(process.env.NEXTAUTH_URL) || process.env.NEXTAUTH_URL !== toOrigin(process.env.NEXTAUTH_URL)) {
    process.env.NEXTAUTH_URL = getBaseUrl();
  }
};
