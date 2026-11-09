import { db } from "@/db";
import { mfaFeatureEnabled, mfaKey } from "@/lib/mfa/config";
import { claimStep, consumeRecoveryCode, countRecoveryCodesLeft, getMfa } from "@/lib/mfa/mfaStore";
import type { Executor, MfaRow } from "@/lib/mfa/mfaStore";
import { hashRecoveryCode, looksLikeRecoveryCode } from "@/lib/mfa/recoveryCodes";
import { openSecret } from "@/lib/mfa/secretCrypto";
import { checkTotp } from "@/lib/mfa/totp";

/**
 * The second step of signing in, and of re-confirming a sensitive change in Settings. SERVER ONLY.
 * Both go through checkCode, so a code is judged the same way everywhere: a 6-digit authenticator code (single use) or one of
 * the recovery codes (single use).
 */

export type CodeCheck =
  | { ok: true; method: "totp" | "recovery"; recoveryLeft?: number }
  | { ok: false; reason: "invalid" | "replayed" | "unavailable" };

/** Checks one typed code against an enrolled, confirmed authenticator. Never throws for a bad code. */
export async function checkCode(userId: string, row: MfaRow, input: string, exec: Executor = db): Promise<CodeCheck> {
  const typed = input.trim();
  if (/^\d{6}$/.test(typed.replace(/\s/g, ""))) {
    const secret = openSecret(row.secretEnc, userId);
    if (secret === null) return { ok: false, reason: "unavailable" };
    const result = await checkTotp(secret, typed.replace(/\s/g, ""));
    if (!result.ok) return { ok: false, reason: "invalid" };
    // The code is right but its time step (or a later one) was already used: say so, so the person waits for the next code
    // instead of retyping the same one. (A wrong code is "invalid", above.)
    return (await claimStep(userId, result.step, exec)) ? { ok: true, method: "totp" } : { ok: false, reason: "replayed" };
  }
  if (looksLikeRecoveryCode(typed)) {
    if (!(await consumeRecoveryCode(userId, hashRecoveryCode(typed), exec))) return { ok: false, reason: "invalid" };
    return { ok: true, method: "recovery", recoveryLeft: await countRecoveryCodesLeft(userId, exec) };
  }
  return { ok: false, reason: "invalid" };
}

/** What sign-in must do about the second factor for this agency login. */
export type SignInGate =
  | { kind: "not_enrolled" }
  | { kind: "skipped_flag_off" }
  | { kind: "required" }
  | { kind: "ok"; method: "totp" | "recovery"; recoveryLeft?: number }
  | { kind: "invalid" }
  | { kind: "replayed" }
  | { kind: "unavailable" };

/**
 * Decides, after the password was right, whether and how a second factor is asked for. A login that never turned two-step on is
 * unaffected. One that did is asked for a code; if the code cannot be checked (no key, unreadable secret) it is refused, never let in.
 */
export async function evaluateSignIn(userId: string, code: string | undefined, exec: Executor = db): Promise<SignInGate> {
  const row = await getMfa(userId, exec);
  if (!row || !row.confirmedAt) return { kind: "not_enrolled" };
  if (!mfaFeatureEnabled()) return { kind: "skipped_flag_off" };
  if (!mfaKey()) return { kind: "unavailable" };
  if (!code || !code.trim()) return { kind: "required" };
  const result = await checkCode(userId, row, code, exec);
  if (result.ok) return { kind: "ok", method: result.method, recoveryLeft: result.recoveryLeft };
  return { kind: result.reason };
}
