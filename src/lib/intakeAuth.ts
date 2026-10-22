import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Shared x-api-key check for the inbound-email intake webhooks (/api/intake and /api/intake/odhh).
 * The key is the INTAKE_WEBHOOK_SECRET environment variable.
 *
 * SERVER ONLY.
 */

/**
 * Constant-time comparison. Both values are SHA-256 hashed first so the buffers are always equal length
 * (timingSafeEqual throws otherwise) and the key's length isn't leaked.
 */
export function isValidApiKey(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Returns an error response when the request must be rejected, or null when it is authorized.
 * Fails closed: if the secret isn't configured, nothing is accepted. Runs before the body is read or parsed.
 */
export function rejectUnlessIntakeAuthorized(req: Request, tag: string): NextResponse<{ success: false; error: string }> | null {
  const expectedSecret = process.env.INTAKE_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error(`[${tag}] INTAKE_WEBHOOK_SECRET is not set — rejecting request.`);
    return NextResponse.json({ success: false, error: "Webhook is not configured." }, { status: 500 });
  }
  if (!isValidApiKey(req.headers.get("x-api-key"), expectedSecret)) {
    console.warn(`[${tag}] Unauthorized request (missing or invalid x-api-key).`);
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
