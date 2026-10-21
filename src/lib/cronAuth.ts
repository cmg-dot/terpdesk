import { createHash, timingSafeEqual } from "crypto";

/** Used only when CRON_SECRET is not set AND this is not a production build. */
const LOCAL_DEV_SECRET = "local-dev-cron-secret";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Compared as SHA-256 digests in constant time.
 * In production a missing CRON_SECRET rejects every call.
 *
 * SERVER ONLY.
 */
export function isCronAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET || (process.env.NODE_ENV !== "production" ? LOCAL_DEV_SECRET : "");
  if (!secret || !header || !header.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(header.slice("Bearer ".length)), digest(secret));
}
