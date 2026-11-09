import { requireRole } from "@/lib/auth/guards";
import { mfaConfigured, mfaFeatureEnabled } from "@/lib/mfa/config";
import { confirmWithPasswordAndCode } from "@/lib/mfa/stepUp";
import { stepUpSchema } from "@/lib/validation/mfa";
import type { StepUpInput } from "@/lib/validation/mfa";

/** Who is asking, for the two-step Settings actions. SERVER ONLY. The id and email always come from the session, never from the request. */

export const SIGNED_IN_ONLY = "You need to be signed in as agency staff to do this.";
export const NOT_AVAILABLE = "Two-step verification is not available right now.";

export type MfaCaller = { id: string; email: string };

/** The signed-in agency login, or null (not signed in, wrong role, or an idle-expired session). */
export async function getMfaCaller(): Promise<MfaCaller | null> {
  try {
    const session = await requireRole("agency");
    if (!session.user.email) return null;
    return { id: session.user.id, email: session.user.email };
  } catch {
    return null;
  }
}

/** The caller, only after the current password AND a current code (or recovery code) were right. One generic message for any failure. */
export async function confirmedCaller(input: StepUpInput): Promise<{ caller: MfaCaller } | { error: string }> {
  const caller = await getMfaCaller();
  if (!caller) return { error: SIGNED_IN_ONLY };
  const parsed = stepUpSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter your password and a code." };
  if (!mfaFeatureEnabled() || !mfaConfigured()) return { error: NOT_AVAILABLE };
  const confirmed = await confirmWithPasswordAndCode({ userId: caller.id, email: caller.email, password: parsed.data.password, code: parsed.data.code });
  return confirmed.ok ? { caller } : { error: confirmed.error };
}
