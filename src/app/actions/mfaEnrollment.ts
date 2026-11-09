"use server";

import QRCode from "qrcode";
import { requireRole } from "@/lib/auth/guards";
import { LOCKED_MESSAGE } from "@/lib/auth/messages";
import { writeAuditLog } from "@/lib/audit";
import { recordMfaFailure, tooManyMfaAttempts } from "@/lib/mfa/attempts";
import { mfaConfigured, mfaFeatureEnabled } from "@/lib/mfa/config";
import { beginEnrollment, completeEnrollment, getMfa } from "@/lib/mfa/mfaStore";
import { formatRecoveryCode, generateRecoveryCodes, hashRecoveryCode } from "@/lib/mfa/recoveryCodes";
import { openSecret, sealSecret } from "@/lib/mfa/secretCrypto";
import { checkTotp, groupSecret, newTotpSecret, totpUri } from "@/lib/mfa/totp";
import type { RecoveryCodesResult, StartEnrollmentResult } from "@/lib/mfa/types";
import { sendMfaChangedEmail } from "@/lib/mfaEmail";
import { confirmEnrollmentSchema } from "@/lib/validation/mfa";
import type { ConfirmEnrollmentInput } from "@/lib/validation/mfa";

/** Turning two-step verification on, from Settings. Agency logins only; every row is the caller's own (id from the session). */

const SIGNED_IN_ONLY = "You need to be signed in as agency staff to do this.";
const NOT_AVAILABLE = "Two-step verification is not available right now.";

/** Step 1: a fresh secret (stored sealed and unconfirmed) and the QR code / typed key to put it in an authenticator app. */
export async function startMfaEnrollment(): Promise<StartEnrollmentResult> {
  let user: { id: string; email: string };
  try {
    const session = await requireRole("agency");
    if (!session.user.email) throw new Error("no email");
    user = { id: session.user.id, email: session.user.email };
  } catch {
    return { success: false, error: SIGNED_IN_ONLY };
  }
  if (!mfaFeatureEnabled() || !mfaConfigured()) return { success: false, error: NOT_AVAILABLE };

  try {
    const secret = newTotpSecret();
    const stored = await beginEnrollment(user.id, sealSecret(secret, user.id));
    if (!stored) return { success: false, error: "Two-step verification is already on for your account." };
    // The QR image is drawn here, so the secret never goes to a third-party service.
    const qrDataUrl = await QRCode.toDataURL(totpUri(secret, user.email), { margin: 1, width: 224, errorCorrectionLevel: "M" });
    return { success: true, qrDataUrl, manualKey: groupSecret(secret) };
  } catch {
    return { success: false, error: "Two-step verification could not be started. Try again in a moment." };
  }
}

/** Step 2: the first code from the app proves it is set up. Turns two-step on and returns the recovery codes, once. */
export async function confirmMfaEnrollment(input: ConfirmEnrollmentInput): Promise<RecoveryCodesResult> {
  let user: { id: string; email: string };
  try {
    const session = await requireRole("agency");
    if (!session.user.email) throw new Error("no email");
    user = { id: session.user.id, email: session.user.email };
  } catch {
    return { success: false, error: SIGNED_IN_ONLY };
  }
  const parsed = confirmEnrollmentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Enter the 6-digit code." };
  if (!mfaFeatureEnabled() || !mfaConfigured()) return { success: false, error: NOT_AVAILABLE };

  try {
    if (await tooManyMfaAttempts(user.email)) return { success: false, error: LOCKED_MESSAGE };
    const row = await getMfa(user.id);
    if (!row || row.confirmedAt) return { success: false, error: "Start again: this setup is no longer open." };
    const secret = openSecret(row.secretEnc, user.id);
    if (secret === null) return { success: false, error: "Start again: this setup could not be read." };

    const check = await checkTotp(secret, parsed.data.code);
    if (!check.ok) {
      await recordMfaFailure(user.id, user.email, "mfa_enroll_failed");
      return { success: false, error: "That code didn't match. Wait for the next code in your app and try again." };
    }

    const codes = generateRecoveryCodes();
    if (!(await completeEnrollment(user.id, check.step, codes.map(hashRecoveryCode)))) {
      return { success: false, error: "Start again: this setup is no longer open." };
    }
    await writeAuditLog({ userId: user.id, userEmail: user.email, action: "mfa_enrolled", details: "totp" });
    void sendMfaChangedEmail(user.email, "enabled");
    return { success: true, recoveryCodes: codes.map(formatRecoveryCode) };
  } catch {
    return { success: false, error: "Two-step verification could not be turned on. Try again in a moment." };
  }
}
