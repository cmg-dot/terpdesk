"use server";

import { getBaseUrl } from "@/lib/baseUrl";
import { randomBytes } from "crypto";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, interpreters, verificationTokens } from "@/db/schema";
import { sendProfileClaimEmail } from "@/lib/accountEmail";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { hashToken } from "@/lib/timesheetToken";

export type ResendVerificationResult = { success: true } | { success: false; error: string };

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 2 * 60 * 1000;

/** Sends a fresh verification link to the signed-in interpreter, replacing any earlier one. */
export async function resendVerification(): Promise<ResendVerificationResult> {
  let session;
  try {
    session = await requireRole("interpreter");
  } catch {
    return { success: false, error: "You need to be signed in as an interpreter." };
  }

  const email = session.user.email?.trim().toLowerCase();
  if (!email) return { success: false, error: "Your account has no email address." };
  const userId = session.user.id;

  try {
    const [profile] = await db
      .select({ userId: interpreters.userId })
      .from(interpreters)
      .where(eq(sql`lower(${interpreters.email})`, email))
      .limit(1);

    if (profile?.userId === userId) return { success: false, error: "Already verified" };
    if (profile?.userId) return { success: false, error: "This profile is linked to another account." };
    if (!profile) return { success: false, error: "There is no interpreter profile for this email to verify." };

    // Throttle: each send is an email to the address, so it must not be repeatable in a loop.
    const [recent] = await db
      .select({ sent: count() })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "verification_resent"),
          eq(auditLogs.userId, userId),
          gt(auditLogs.createdAt, new Date(Date.now() - COOLDOWN_MS)),
        ),
      );
    if (Number(recent?.sent ?? 0) > 0) return { success: false, error: "A link was just sent. Please wait a couple of minutes." };

    // Only the hash is stored. Replacing (not adding) keeps exactly one valid link per address.
    const rawToken = randomBytes(32).toString("hex");
    await db.transaction(async (tx) => {
      await tx.delete(verificationTokens).where(eq(verificationTokens.identifier, email));
      await tx.insert(verificationTokens).values({
        identifier: email,
        token: hashToken(rawToken),
        expires: new Date(Date.now() + TOKEN_TTL_MS),
      });
    });

    const baseUrl = getBaseUrl();
    const link = `${baseUrl}/verify-claim?token=${rawToken}`;
    if (process.env.NODE_ENV !== "production") {
      // Development stand-in for the email. In production the token is never logged.
      console.log(["", "", "=== VERIFICATION LINK ===", link, "=========================", "", ""].join("\n"));
    } else {
      try {
        await sendProfileClaimEmail({ to: email, name: session.user.name ?? "there", link });
      } catch {
        console.error("[resendVerification] could not send the verification email");
        return { success: false, error: "We could not send the email. Please try again." };
      }
    }

    await writeAuditLog({ userId, userEmail: email, action: "verification_resent", details: "claim link re-issued" });
    return { success: true };
  } catch (err) {
    logError("resendVerification", err);
    return { success: false, error: "We could not send a new link. Please try again." };
  }
}
