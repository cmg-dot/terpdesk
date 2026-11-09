import { writeAuditLog } from "@/lib/audit";
import { MFA_INVALID_MESSAGE, MFA_REQUIRED_MESSAGE, MFA_UNAVAILABLE_MESSAGE } from "@/lib/auth/messages";
import { evaluateSignIn } from "@/lib/mfa/secondFactor";
import type { SignInGate } from "@/lib/mfa/secondFactor";

/**
 * The second factor inside NextAuth's authorize(), called only after the password and portal were right. SERVER ONLY.
 * Returns which factor was used (null when none was needed) or throws one of the displayable messages. A wrong code is written as
 * `login_failed`, the row the existing lockout counts, so guessing codes runs into the same 5-in-15-minutes limit as guessing passwords.
 */
export async function enforceSecondFactor(user: { id: string; email: string }, code: string | undefined): Promise<{ method: "totp" | "recovery" | null }> {
  let gate: SignInGate;
  try {
    gate = await evaluateSignIn(user.id, code);
  } catch {
    gate = { kind: "unavailable" }; // cannot tell whether a code is owed: refuse rather than let the login in
  }

  switch (gate.kind) {
    case "not_enrolled":
      return { method: null };
    case "skipped_flag_off":
      await writeAuditLog({ userId: user.id, userEmail: user.email, action: "mfa_skipped_flag_off", details: "MFA_ENABLED=false" });
      return { method: null };
    case "required":
      throw new Error(MFA_REQUIRED_MESSAGE);
    case "invalid":
      await writeAuditLog({ userId: user.id, userEmail: user.email, action: "login_failed", details: "invalid two-step code" });
      throw new Error(MFA_INVALID_MESSAGE);
    case "unavailable":
      await writeAuditLog({ userId: user.id, userEmail: user.email, action: "mfa_unavailable", details: "second factor could not be checked" });
      throw new Error(MFA_UNAVAILABLE_MESSAGE);
    case "ok":
      if (gate.method === "recovery") {
        await writeAuditLog({ userId: user.id, userEmail: user.email, action: "mfa_recovery_used", details: `recovery codes left=${gate.recoveryLeft ?? 0}` });
      }
      return { method: gate.method };
  }
}
