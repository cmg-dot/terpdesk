import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { LOCKED_MESSAGE } from "@/lib/auth/messages";
import { recordMfaFailure, tooManyMfaAttempts } from "@/lib/mfa/attempts";
import { getMfa } from "@/lib/mfa/mfaStore";
import { checkCode } from "@/lib/mfa/secondFactor";

/**
 * Re-confirmation before turning two-step off or issuing new recovery codes: the current password AND a current code (or recovery
 * code), so a borrowed, unlocked laptop cannot weaken the account. SERVER ONLY. One generic message for any failure.
 */

// Compared against when the user row is somehow missing, so the time taken does not say which part was wrong.
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7Z2m5G3N7uK5QdY8bq3rN1Zc1l3oD3a";
export const STEP_UP_FAILED_MESSAGE = "Your password or code was not right. Check both and try again.";

export type StepUpResult = { ok: true } | { ok: false; error: string };

export async function confirmWithPasswordAndCode(p: { userId: string; email: string; password: string; code: string }): Promise<StepUpResult> {
  if (await tooManyMfaAttempts(p.email)) return { ok: false, error: LOCKED_MESSAGE };
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, p.userId)).limit(1);
  const passwordOk = await bcrypt.compare(p.password, user?.passwordHash ?? DUMMY_HASH);
  const row = passwordOk ? await getMfa(p.userId) : null;
  // The code is only spent (a code works once) when the password was right.
  const codeOk = row?.confirmedAt ? (await checkCode(p.userId, row, p.code)).ok : false;
  if (!passwordOk || !codeOk) {
    await recordMfaFailure(p.userId, p.email, "mfa_stepup_failed");
    return { ok: false, error: STEP_UP_FAILED_MESSAGE };
  }
  return { ok: true };
}
