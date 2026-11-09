import { db } from "@/db";
import { mfaFeatureEnabled, mfaKey } from "@/lib/mfa/config";
import { claimStep, consumeRecoveryCode, countRecoveryCodesLeft, listConfirmedDevices } from "@/lib/mfa/mfaStore";
import type { Executor, MfaDevice } from "@/lib/mfa/mfaStore";
import { hashRecoveryCode, looksLikeRecoveryCode } from "@/lib/mfa/recoveryCodes";
import { openSecret } from "@/lib/mfa/secretCrypto";
import { checkTotp } from "@/lib/mfa/totp";

/**
 * The second step of signing in, and of re-confirming a sensitive change in Settings. SERVER ONLY.
 * Both go through checkCode, so a code is judged the same way everywhere: a 6-digit authenticator code (single use) or one of
 * the recovery codes (single use).
 */

export type CodeCheck =
  | { ok: true; method: "totp" | "recovery"; recoveryLeft?: number; deviceId?: string; deviceLabel?: string }
  | { ok: false; reason: "invalid" | "replayed" | "unavailable" };

/**
 * Tries a 6-digit code against each of the login's confirmed devices (most recently used first) and stops at the first that
 * accepts it. Each device has its own secret and its own single-use counter. A device whose secret cannot be opened is skipped; the
 * result is "unavailable" only when NO device could be read (then a code cannot be judged, and the login is refused).
 */
async function checkAuthenticatorCode(userId: string, devices: MfaDevice[], code: string, exec: Executor): Promise<CodeCheck> {
  let unreadable = 0;
  let replayed = false;
  for (const device of devices) {
    const secret = openSecret(device.secretEnc, userId);
    if (secret === null) {
      unreadable += 1;
      continue;
    }
    const result = await checkTotp(secret, code);
    if (!result.ok) continue;
    if (await claimStep(userId, device.id, result.step, exec)) return { ok: true, method: "totp", deviceId: device.id, deviceLabel: device.label };
    replayed = true; // right code, but this device's time step (or a later one) was already used: keep looking, then say so
  }
  if (replayed) return { ok: false, reason: "replayed" };
  return { ok: false, reason: unreadable === devices.length ? "unavailable" : "invalid" };
}

/** Checks one typed code against the login's confirmed authenticators or its recovery codes. Never throws for a bad code. */
export async function checkCode(userId: string, devices: MfaDevice[], input: string, exec: Executor = db): Promise<CodeCheck> {
  const typed = input.trim();
  if (/^\d{6}$/.test(typed.replace(/\s/g, ""))) {
    // A right code whose time step was already used is "replayed" (so the person waits for the next one); a wrong code is "invalid".
    return checkAuthenticatorCode(userId, devices, typed.replace(/\s/g, ""), exec);
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
  | { kind: "ok"; method: "totp" | "recovery"; recoveryLeft?: number; deviceId?: string }
  | { kind: "invalid" }
  | { kind: "replayed" }
  | { kind: "unavailable" };

/**
 * Decides, after the password was right, whether and how a second factor is asked for. A login that never turned two-step on is
 * unaffected. One that did is asked for a code; if the code cannot be checked (no key, unreadable secret) it is refused, never let in.
 */
export async function evaluateSignIn(userId: string, code: string | undefined, exec: Executor = db): Promise<SignInGate> {
  const devices = await listConfirmedDevices(userId, exec);
  if (devices.length === 0) return { kind: "not_enrolled" };
  if (!mfaFeatureEnabled()) return { kind: "skipped_flag_off" };
  if (!mfaKey()) return { kind: "unavailable" };
  if (!code || !code.trim()) return { kind: "required" };
  const result = await checkCode(userId, devices, code, exec);
  if (result.ok) return { kind: "ok", method: result.method, recoveryLeft: result.recoveryLeft, deviceId: result.deviceId };
  return { kind: result.reason };
}
