"use server";

import bcrypt from "bcryptjs";
import { and, count, eq, gt, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { sendPasswordChangedEmail, sendPasswordResetEmail } from "@/lib/accountEmail";
import { writeAuditLog } from "@/lib/audit";
import { endSessions } from "@/lib/auth/sessionRevocation";
import type { AppRole } from "@/lib/auth/routes";
import { getBaseUrl } from "@/lib/baseUrl";
import { logError } from "@/lib/logError";
import { consumeResetToken, issueResetToken, RESET_LINK_PROBLEMS as LINK_PROBLEMS, RESET_TOKEN_SHAPE } from "@/lib/passwordReset";
import type { ResetLinkProblem } from "@/lib/passwordReset";
import { isPlaceholderEmail } from "@/lib/placeholderEmail";
import { passwordSchema } from "@/lib/validation/password";

export type RequestPasswordResetResult = { success: true } | { success: false; error: string };
export type CompletePasswordResetResult =
  | { success: true; portal: AppRole }
  | { success: false; error: string; problem?: ResetLinkProblem };

const requestSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(255) });
const completeSchema = z.object({
  token: z.string().regex(RESET_TOKEN_SHAPE, "This reset link is not valid."),
  password: passwordSchema,
});

// Per address: one link every 2 minutes, at most 5 an hour. Counted from the audit log, for unknown addresses too.
const COOLDOWN_MS = 2 * 60 * 1000;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;
const HOURLY_MAX = 5;

/**
 * Public: emails a reset link to an existing agency or interpreter login. The answer is always the same success, whether or not the
 * address has an account or the request was throttled, so the form never reveals who has an account. Self-triggered, so the email
 * skips the agency's per-interpreter switch and EMAIL_ALLOWLIST (silent mode still stops it).
 */
export async function requestPasswordReset(input: { email: string }): Promise<RequestPasswordResetResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  const { email } = parsed.data;

  try {
    const [recent] = await db
      .select({ sent: count(), last: max(auditLogs.createdAt) })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "password_reset_requested"),
          eq(auditLogs.userEmail, email),
          gt(auditLogs.createdAt, new Date(Date.now() - HOURLY_WINDOW_MS)),
        ),
      );
    const last = recent?.last ? new Date(recent.last).getTime() : 0;
    if (Number(recent?.sent ?? 0) >= HOURLY_MAX || Date.now() - last < COOLDOWN_MS) return { success: true };

    const [user] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(sql`lower(${users.email})`, email), inArray(users.role, ["agency", "interpreter"])))
      .limit(1);

    if (!user || isPlaceholderEmail(email)) {
      await writeAuditLog({ userId: null, userEmail: email, action: "password_reset_requested", details: "no account" });
      return { success: true };
    }

    const rawToken = await issueResetToken(email);
    const link = `${getBaseUrl()}/reset-password?token=${rawToken}`;
    let outcome = "sent";
    if (process.env.NODE_ENV !== "production") {
      // Development stand-in for the email. Never done in production: logs must not contain live tokens.
      console.log(["", "", "=== PASSWORD RESET LINK ===", link, "===========================", ""].join("\n"));
    } else {
      outcome = await sendPasswordResetEmail({ to: email, name: user.name, link });
    }
    await writeAuditLog({ userId: user.id, userEmail: email, action: "password_reset_requested", details: `email=${outcome}` });
    return { success: true };
  } catch (err) {
    logError("requestPasswordReset", err);
    return { success: false, error: "We could not send a reset link. Please try again." };
  }
}

/**
 * Public: sets a new password with an emailed link. The link is used up here (never when the page opens), together with every other
 * reset link for the address; every session of the login ends; earlier failed sign-ins stop counting (see the lockout in
 * lib/auth/options.ts); a notice goes to the address. Two-step verification is unaffected: it is still asked for at sign-in.
 */
export async function completePasswordReset(input: { token: string; password: string }): Promise<CompletePasswordResetResult> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) {
    const tokenBad = parsed.error.issues.some((issue) => issue.path[0] === "token");
    return tokenBad
      ? { success: false, error: LINK_PROBLEMS.invalid, problem: "invalid" }
      : { success: false, error: parsed.error.issues[0]?.message ?? "Choose a different password." };
  }
  const { token, password } = parsed.data;

  try {
    // Hashed before the transaction, so the token row is held only briefly.
    const passwordHash = await bcrypt.hash(password, 12);
    const outcome = await db.transaction(async (tx) => {
      const used = await consumeResetToken(tx, token);
      if ("problem" in used) return used;
      const [user] = await tx
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(and(eq(sql`lower(${users.email})`, used.email), inArray(users.role, ["agency", "interpreter"])))
        .returning({ id: users.id, name: users.name, role: users.role });
      if (!user) return { problem: "invalid" as const };
      await endSessions(tx, user.id, null);
      return { email: used.email, user };
    });

    if ("problem" in outcome) return { success: false, error: LINK_PROBLEMS[outcome.problem], problem: outcome.problem };

    const { email, user } = outcome;
    await writeAuditLog({ userId: user.id, userEmail: email, action: "password_reset_completed", details: `role=${user.role}` });
    await sendPasswordChangedEmail({ to: email, name: user.name, via: "reset", resetUrl: `${getBaseUrl()}/reset-password` });
    return { success: true, portal: user.role === "agency" ? "agency" : "interpreter" };
  } catch (err) {
    logError("completePasswordReset", err);
    return { success: false, error: "We could not change your password. Please try again." };
  }
}
