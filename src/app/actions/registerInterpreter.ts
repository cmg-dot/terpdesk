"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, users, verificationTokens } from "@/db/schema";
import { sendProfileClaimEmail } from "@/lib/accountEmail";
import { writeAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logError";
import { hashToken } from "@/lib/timesheetToken";
import { registerInterpreterSchema } from "@/lib/validation/registerInterpreter";
import type { RegisterInterpreterInput } from "@/lib/validation/registerInterpreter";

export type RegisterInterpreterResult =
  | { success: true; /** True when an agency profile exists for this email and the owner must verify it. */ verificationRequired: boolean }
  | { success: false; error: string };

const EMAIL_TAKEN = "An account with this email already exists.";
const PROFILE_CLAIMED = "This interpreter profile is already linked to another account.";
const CLAIM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

class ProfileAlreadyClaimedError extends Error {}

/**
 * Public self-serve sign-up for interpreters (no session exists yet).
 *
 * - No profile for the email: creates the login and a new profile, linked immediately.
 * - A profile already exists for the email (created by an agency): creates the login but does NOT link it.
 *   Linking would hand a stranger someone else's profile, so a one-time link is sent to the address and the
 *   profile is only connected when it is confirmed (see verifyClaim).
 */
export async function registerInterpreter(input: RegisterInterpreterInput): Promise<RegisterInterpreterResult> {
  const parsed = registerInterpreterSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  const { name, email, phone, password } = parsed.data;

  try {
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) return { success: false, error: EMAIL_TAKEN };

    const passwordHash = await bcrypt.hash(password, 12);

    const outcome = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email, passwordHash, name, role: "interpreter" })
        .returning({ id: users.id });

      const [profile] = await tx
        .select({ id: interpreters.id, userId: interpreters.userId })
        .from(interpreters)
        .where(eq(sql`lower(${interpreters.email})`, email))
        .limit(1);

      if (profile) {
        if (profile.userId) throw new ProfileAlreadyClaimedError();

        // Only the hash is stored; the raw token exists solely in the emailed link.
        const rawToken = randomBytes(32).toString("hex");
        await tx.insert(verificationTokens).values({
          identifier: email,
          token: hashToken(rawToken),
          expires: new Date(Date.now() + CLAIM_TOKEN_TTL_MS),
        });
        return { userId: created.id, interpreterId: profile.id, rawToken };
      }

      const [inserted] = await tx
        .insert(interpreters)
        .values({ name, email, phone, userId: created.id })
        .returning({ id: interpreters.id });
      return { userId: created.id, interpreterId: inserted.id, rawToken: null };
    });

    if (outcome.rawToken) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const link = `${baseUrl}/verify-claim?token=${outcome.rawToken}`;
      if (process.env.NODE_ENV !== "production") {
        // Development stand-in for the email. Never done in production: logs must not contain live tokens.
        console.log(["", "", "=== VERIFICATION LINK ===", link, "=========================", ""].join("\n"));
      } else {
        try {
          await sendProfileClaimEmail({ to: email, name, link });
        } catch {
          console.error("[registerInterpreter] could not send the verification email");
        }
      }
    }

    await writeAuditLog({
      userId: outcome.userId,
      userEmail: email,
      action: outcome.rawToken ? "profile_claim_requested" : "interpreter_registered",
      details: `interpreterId=${outcome.interpreterId}`,
    });
    return { success: true, verificationRequired: outcome.rawToken !== null };
  } catch (err) {
    if (err instanceof ProfileAlreadyClaimedError) return { success: false, error: PROFILE_CLAIMED };
    // Drizzle wraps driver errors, so the Postgres code can sit on `cause` rather than on the error itself.
    const pgCode = (err as { code?: string; cause?: { code?: string } } | null)?.code ?? (err as { cause?: { code?: string } } | null)?.cause?.code;
    // Two sign-ups racing on the same email hit the unique constraint.
    if (pgCode === "23505") return { success: false, error: EMAIL_TAKEN };
    logError("registerInterpreter", err);
    return { success: false, error: "We could not create your account. Please try again." };
  }
}
