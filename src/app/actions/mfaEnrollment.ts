"use server";

import QRCode from "qrcode";
import { LOCKED_MESSAGE } from "@/lib/auth/messages";
import { writeAuditLog } from "@/lib/audit";
import { recordMfaFailure, tooManyMfaAttempts } from "@/lib/mfa/attempts";
import { NOT_AVAILABLE, SIGNED_IN_ONLY, confirmedCaller, getMfaCaller } from "@/lib/mfa/caller";
import { mfaConfigured, mfaFeatureEnabled } from "@/lib/mfa/config";
import { defaultDeviceLabel } from "@/lib/mfa/labels";
import { MAX_DEVICES, beginEnrollment, completeEnrollment, getPendingDevice, listConfirmedDevices } from "@/lib/mfa/mfaStore";
import { formatRecoveryCode, generateRecoveryCodes, hashRecoveryCode } from "@/lib/mfa/recoveryCodes";
import { openSecret, sealSecret } from "@/lib/mfa/secretCrypto";
import { checkTotp, groupSecret, newTotpSecret, totpUri } from "@/lib/mfa/totp";
import type { ConfirmEnrollmentResult, StartEnrollmentResult } from "@/lib/mfa/types";
import { sendMfaChangedEmail } from "@/lib/mfaEmail";
import { confirmEnrollmentSchema } from "@/lib/validation/mfa";
import type { ConfirmEnrollmentInput, StepUpInput } from "@/lib/validation/mfa";

/**
 * Adding an authenticator device from Settings. Agency logins only; every row is the caller's own (id from the session).
 * The FIRST device is a plain opt-in. Every later one first needs the current password AND a code from a device the login already
 * has, checked here on the server (not just in the browser), so an unlocked laptop cannot be used to enrol an attacker's phone.
 */

const FULL = `You already have ${MAX_DEVICES} devices. Remove one before adding another.`;

/** Step 1: a fresh secret (stored sealed and unconfirmed) and the QR code / typed key to put it in an authenticator app. */
export async function startMfaEnrollment(input?: StepUpInput): Promise<StartEnrollmentResult> {
  const caller = await getMfaCaller();
  if (!caller) return { success: false, error: SIGNED_IN_ONLY };
  if (!mfaFeatureEnabled() || !mfaConfigured()) return { success: false, error: NOT_AVAILABLE };

  try {
    const existing = await listConfirmedDevices(caller.id);
    if (existing.length >= MAX_DEVICES) return { success: false, error: FULL };
    if (existing.length > 0) {
      const confirmed = await confirmedCaller(input ?? { password: "", code: "" });
      if ("error" in confirmed) return { success: false, error: confirmed.error };
    }

    const secret = newTotpSecret();
    if ((await beginEnrollment(caller.id, sealSecret(secret, caller.id))) === "full") return { success: false, error: FULL };
    // The QR image is drawn here, so the secret never goes to a third-party service.
    const qrDataUrl = await QRCode.toDataURL(totpUri(secret, caller.email), { margin: 1, width: 224, errorCorrectionLevel: "M" });
    return { success: true, qrDataUrl, manualKey: groupSecret(secret) };
  } catch {
    return { success: false, error: "Two-step verification could not be started. Try again in a moment." };
  }
}

/**
 * Step 2: the first code from the app proves it is set up, and the device gets its name. For the login's first device this turns
 * two-step on and returns the recovery codes, once; for a later device the existing recovery codes are left exactly as they are.
 */
export async function confirmMfaEnrollment(input: ConfirmEnrollmentInput): Promise<ConfirmEnrollmentResult> {
  const caller = await getMfaCaller();
  if (!caller) return { success: false, error: SIGNED_IN_ONLY };
  const parsed = confirmEnrollmentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Enter the 6-digit code." };
  if (!mfaFeatureEnabled() || !mfaConfigured()) return { success: false, error: NOT_AVAILABLE };

  try {
    if (await tooManyMfaAttempts(caller.email)) return { success: false, error: LOCKED_MESSAGE };
    const pending = await getPendingDevice(caller.id);
    if (!pending) return { success: false, error: "Start again: this setup is no longer open." };
    const secret = openSecret(pending.secretEnc, caller.id);
    if (secret === null) return { success: false, error: "Start again: this setup could not be read." };

    const check = await checkTotp(secret, parsed.data.code);
    if (!check.ok) {
      await recordMfaFailure(caller.id, caller.email, "mfa_enroll_failed");
      return { success: false, error: "That code didn't match. Wait for the next code in your app and try again." };
    }

    const existing = (await listConfirmedDevices(caller.id)).length;
    const label = parsed.data.label || defaultDeviceLabel(existing);
    const codes = generateRecoveryCodes();
    const done = await completeEnrollment(caller.id, check.step, label, codes.map(hashRecoveryCode));
    if (!done.ok) return { success: false, error: done.reason === "full" ? FULL : "Start again: this setup is no longer open." };

    await writeAuditLog({ userId: caller.id, userEmail: caller.email, action: "mfa_device_added", details: `device=${done.deviceId}; label=${label}` });
    if (done.first) await writeAuditLog({ userId: caller.id, userEmail: caller.email, action: "mfa_enrolled", details: "totp" });
    void sendMfaChangedEmail(caller.email, done.first ? "enabled" : "device_added", done.first ? undefined : label);
    return { success: true, recoveryCodes: done.first ? codes.map(formatRecoveryCode) : null, deviceLabel: label };
  } catch {
    return { success: false, error: "Two-step verification could not be turned on. Try again in a moment." };
  }
}
