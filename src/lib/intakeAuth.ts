import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Shared x-api-key check for the intake endpoints: the inbound-email webhooks (/api/intake, /api/intake/odhh; key in
 * INTAKE_WEBHOOK_SECRET) and the public intake form (/api/intake/public; key in INTAKE_API_KEY).
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
 * `secretEnv` names the environment variable holding the key: INTAKE_WEBHOOK_SECRET for the email webhooks (the AWS
 * Lambda), INTAKE_API_KEY for the public intake form's server. Each caller has its own key.
 */
export function rejectUnlessIntakeAuthorized(
  req: Request,
  tag: string,
  secretEnv: "INTAKE_WEBHOOK_SECRET" | "INTAKE_API_KEY" = "INTAKE_WEBHOOK_SECRET",
): NextResponse<{ success: false; error: string }> | null {
  const expectedSecret = process.env[secretEnv];
  if (!expectedSecret) {
    console.error(`[${tag}] ${secretEnv} is not set — rejecting request.`);
    return NextResponse.json({ success: false, error: "Webhook is not configured." }, { status: 500 });
  }
  if (!isValidApiKey(req.headers.get("x-api-key"), expectedSecret)) {
    console.warn(`[${tag}] Unauthorized request (missing or invalid x-api-key).`);
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
