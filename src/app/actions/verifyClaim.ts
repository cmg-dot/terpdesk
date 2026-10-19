"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { agencyInterpreters, interpreters, users, verificationTokens } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { hashToken } from "@/lib/timesheetToken";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

type ClaimOutcome =
  | { ok: true; userId: string; email: string; interpreterId: string }
  | { ok: false; reason: "invalid" | "expired" | "unavailable" };

/**
 * Public on purpose: the one-time token in the emailed link is the authorization. It is checked against its
 * stored hash, consumed in the same transaction as the link, and expires after 24 hours.
 * Called from the /verify-claim confirmation button, not on page load, so mail scanners that pre-open links
 * cannot use the token up.
 */
export async function verifyClaim(formData: FormData): Promise<never> {
  const parsedToken = tokenSchema.safeParse(formData.get("token"));
  if (!parsedToken.success) redirect("/verify-claim?error=invalid");

  const tokenHash = hashToken(parsedToken.data);

  const outcome: ClaimOutcome = await db.transaction(async (tx) => {
    // Consuming the token first makes it single-use even if two requests race.
    const [token] = await tx.delete(verificationTokens).where(eq(verificationTokens.token, tokenHash)).returning();
    if (!token) return { ok: false, reason: "invalid" } as const;
    if (token.expires.getTime() < Date.now()) return { ok: false, reason: "expired" } as const;

    const [user] = await tx
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.email, token.identifier), eq(users.role, "interpreter")))
      .limit(1);
    if (!user) return { ok: false, reason: "unavailable" } as const;

    // `userId IS NULL` keeps an already-claimed profile from being taken over.
    const linked = await tx
      .update(interpreters)
      .set({ userId: user.id, name: user.name, updatedAt: new Date() })
      .where(and(eq(sql`lower(${interpreters.email})`, token.identifier), isNull(interpreters.userId)))
      .returning({ id: interpreters.id });
    if (linked.length === 0) return { ok: false, reason: "unavailable" } as const;

    // Shadow upgrade: every agency that already had this person on its roster now sees the new account. Their
    // existing 'approved' rows are kept as they are; only the owner is filled in. No agency is assumed.
    await tx
      .update(agencyInterpreters)
      .set({ userId: user.id, updatedAt: new Date() })
      .where(and(eq(agencyInterpreters.interpreterId, linked[0].id), isNull(agencyInterpreters.userId)));

    return { ok: true, userId: user.id, email: token.identifier, interpreterId: linked[0].id } as const;
  });

  if (!outcome.ok) redirect(`/verify-claim?error=${outcome.reason}`);

  await writeAuditLog({
    userId: outcome.userId,
    userEmail: outcome.email,
    action: "interpreter_profile_claimed",
    details: `interpreterId=${outcome.interpreterId}; verified by email link`,
  });

  // Not signed in yet? The middleware sends them to log in and then on to this page.
  redirect("/interpreter-home?verified=true");
}
