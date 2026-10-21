import jwt from "jsonwebtoken";
import { z } from "zod";
import { getAuthSecret } from "@/lib/auth/secret";

/**
 * Signed link for the secure job-details page (sent in the booking confirmation email).
 *
 * - Signed with the NextAuth secret (required in production), NOT the offer-token secret, and with its own audience,
 *   so an offer link can never be used as a details link or the other way round.
 * - Expires 14 days after the job ends (at least 1 day, at most 180 days from now).
 * - It is also re-checked on every use: the page only shows anything while the interpreter is still booked on the
 *   job (state lock), so removing them from the job or cancelling it switches the link off immediately.
 *
 * SERVER ONLY.
 */

const AUDIENCE = "terpdesk:job-details";
const DAY_SECONDS = 24 * 60 * 60;

const payloadSchema = z.object({ requestId: z.string().uuid(), interpreterId: z.string().uuid() });
export type JobDetailsTokenPayload = z.infer<typeof payloadSchema>;

/** Null when no signing secret is configured (the email then simply has no details button). */
export function createJobDetailsToken(payload: JobDetailsTokenPayload, jobEndsAt: Date): string | null {
  const secret = getAuthSecret();
  if (!secret) return null;
  const untilEnd = Number.isNaN(jobEndsAt.getTime()) ? 0 : Math.floor((jobEndsAt.getTime() - Date.now()) / 1000);
  const expiresIn = Math.min(180 * DAY_SECONDS, Math.max(DAY_SECONDS, untilEnd + 14 * DAY_SECONDS));
  return jwt.sign(payloadSchema.parse(payload), secret, { audience: AUDIENCE, expiresIn });
}

export function verifyJobDetailsToken(token: string): JobDetailsTokenPayload | null {
  const secret = getAuthSecret();
  if (!secret || !token || token.length > 2000) return null;
  try {
    const decoded = jwt.verify(token, secret, { audience: AUDIENCE });
    const parsed = payloadSchema.safeParse(decoded);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
