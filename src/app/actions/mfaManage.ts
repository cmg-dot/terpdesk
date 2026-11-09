"use server";

import { requireRole } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/audit";
import { mfaConfigured, mfaFeatureEnabled } from "@/lib/mfa/config";
import { removeMfa, replaceRecoveryCodes } from "@/lib/mfa/mfaStore";
import { formatRecoveryCode, generateRecoveryCodes, hashRecoveryCode } from "@/lib/mfa/recoveryCodes";
import { confirmWithPasswordAndCode } from "@/lib/mfa/stepUp";
import type { DisableResult, RecoveryCodesResult } from "@/lib/mfa/types";
import { sendMfaChangedEmail } from "@/lib/mfaEmail";
import { stepUpSchema } from "@/lib/validation/mfa";
import type { StepUpInput } from "@/lib/validation/mfa";

/**
 * Changing two-step verification once it is on. Both actions re-confirm with the current password AND a current code first, so an
 * unlocked, borrowed laptop cannot weaken the account. Agency logins only; every row is the caller's own (id from the session).
 */

const SIGNED_IN_ONLY = "You need to be signed in as agency staff to do this.";

type Caller = { id: string; email: string };

async function confirmedCaller(input: StepUpInput): Promise<{ caller: Caller } | { error: string }> {
  let caller: Caller;
  try {
    const session = await requireRole("agency");
    if (!session.user.email) throw new Error("no email");
    caller = { id: session.user.id, email: session.user.email };
  } catch {
    return { error: SIGNED_IN_ONLY };
  }
  const parsed = stepUpSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter your password and a code." };
  if (!mfaFeatureEnabled() || !mfaConfigured()) return { error: "Two-step verification is not available right now." };
  const confirmed = await confirmWithPasswordAndCode({ userId: caller.id, email: caller.email, password: parsed.data.password, code: parsed.data.code });
  return confirmed.ok ? { caller } : { error: confirmed.error };
}

/** Turns two-step verification off: the authenticator and all recovery codes are deleted. */
export async function disableMfa(input: StepUpInput): Promise<DisableResult> {
  try {
    const checked = await confirmedCaller(input);
    if ("error" in checked) return { success: false, error: checked.error };
    await removeMfa(checked.caller.id);
    await writeAuditLog({ userId: checked.caller.id, userEmail: checked.caller.email, action: "mfa_disabled", details: "totp" });
    void sendMfaChangedEmail(checked.caller.email, "disabled");
    return { success: true };
  } catch {
    return { success: false, error: "Two-step verification could not be turned off. Try again in a moment." };
  }
}

/** Replaces every recovery code with a new set (the old ones stop working) and returns the new ones, once. */
export async function regenerateRecoveryCodes(input: StepUpInput): Promise<RecoveryCodesResult> {
  try {
    const checked = await confirmedCaller(input);
    if ("error" in checked) return { success: false, error: checked.error };
    const codes = generateRecoveryCodes();
    await replaceRecoveryCodes(checked.caller.id, codes.map(hashRecoveryCode));
    await writeAuditLog({ userId: checked.caller.id, userEmail: checked.caller.email, action: "mfa_recovery_regenerated", details: `codes=${codes.length}` });
    void sendMfaChangedEmail(checked.caller.email, "recovery_regenerated");
    return { success: true, recoveryCodes: codes.map(formatRecoveryCode) };
  } catch {
    return { success: false, error: "New recovery codes could not be created. Try again in a moment." };
  }
}
