import { generateSecret, generateURI, verify } from "otplib";
import { MFA_ISSUER } from "@/lib/mfa/config";

/**
 * TOTP (RFC 6238) for authenticator apps: SHA-1, 6 digits, 30-second steps, which is what Google Authenticator, 1Password,
 * Authy and Microsoft Authenticator all use. A thin wrapper so the rest of the app never sees the library's API.
 */

const PERIOD_SECONDS = 30;
const DIGITS = 6;

/** A new base32 shared secret (160 bits). */
export const newTotpSecret = (): string => generateSecret();

/** The otpauth:// link an authenticator app reads from the QR code. */
export const totpUri = (secret: string, accountEmail: string): string =>
  generateURI({ issuer: MFA_ISSUER, label: accountEmail, secret, algorithm: "sha1", digits: DIGITS, period: PERIOD_SECONDS });

/** "ABCD EFGH IJKL ..." for typing the key in by hand. */
export const groupSecret = (secret: string): string => (secret.match(/.{1,4}/g) ?? [secret]).join(" ");

export type TotpCheck = { ok: true; step: number } | { ok: false };

/**
 * Checks a 6-digit code against a secret, allowing one 30-second step either side for clock drift. `step` is the time step the
 * code belongs to; the caller records it so the same code cannot be used twice. `nowMs` exists for tests.
 */
export async function checkTotp(secret: string, token: string, nowMs: number = Date.now()): Promise<TotpCheck> {
  if (!/^\d{6}$/.test(token)) return { ok: false };
  try {
    const nowSec = Math.floor(nowMs / 1000);
    const result = await verify({ secret, token, algorithm: "sha1", digits: DIGITS, period: PERIOD_SECONDS, epoch: nowSec, epochTolerance: PERIOD_SECONDS });
    // `delta` is how many steps from the current one the code matched (0, or -1 / +1 for a drifting clock).
    return result.valid ? { ok: true, step: Math.floor(nowSec / PERIOD_SECONDS) + result.delta } : { ok: false };
  } catch {
    return { ok: false };
  }
}
