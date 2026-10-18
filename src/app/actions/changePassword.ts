"use server";

import bcrypt from "bcryptjs";
import { and, count, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireSession } from "@/lib/auth/guards";
import { passwordSchema } from "@/lib/validation/password";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(200),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ["newPassword"],
    message: "Choose a password different from your current one.",
  });

export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
export type ChangePasswordResult = { success: true } | { success: false; error: string };

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

/** Any signed-in user changing their own password. The target account always comes from the session. */
export async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { success: false, error: "You need to be signed in to do this." };
  }

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  const { currentPassword, newPassword } = parsed.data;

  const userId = session.user.id;
  const userEmail = session.user.email ?? null;

  try {
    // A stolen session must not be able to guess the current password without limit.
    const [recent] = await db
      .select({ failures: count() })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "password_change_failed"),
          eq(auditLogs.userId, userId),
          gt(auditLogs.createdAt, new Date(Date.now() - WINDOW_MS)),
        ),
      );
    if (Number(recent?.failures ?? 0) >= MAX_FAILED_ATTEMPTS) {
      return { success: false, error: "Too many incorrect attempts. Try again in 15 minutes." };
    }

    const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return { success: false, error: "Account not found." };

    const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentOk) {
      await writeAuditLog({ userId, userEmail, action: "password_change_failed", details: "incorrect current password" });
      return { success: false, error: "Your current password is incorrect." };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));

    await writeAuditLog({ userId, userEmail, action: "password_changed", details: "self-service" });
    return { success: true };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? "unknown";
    console.error(`[changePassword] failed (code: ${code})`);
    return { success: false, error: "We could not change your password. Please try again." };
  }
}
