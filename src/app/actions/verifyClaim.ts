"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { agencyInterpreters, interpreters, users, verificationTokens } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logError";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { notifyAgencyAdmins } from "@/lib/notifications";
import { hashToken } from "@/lib/timesheetToken";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * After a successful claim the link stays usable for this long. A double click, a retry on a slow connection or a
 * link scanner repeating the request then lands on the same success page instead of "not valid". Replaying it is
 * harmless: the claim is bound to the one account whose email the token was issued to and changes nothing twice.
 */
const REUSE_GRACE_MS = 5 * 60 * 1000;

type ClaimOutcome =
  | { ok: true; userId: string; email: string; name: string; interpreterId: string; firstTime: boolean }
  | { ok: false; reason: "invalid" | "expired" | "unavailable" };

/**
 * Public on purpose: the one-time token in the emailed link is the authorization. It is checked against its
 * stored hash and expires after 24 hours.
 *
 * Opening the link (a GET) never touches the token: this runs only when the person presses the confirm button,
 * which submits a POST. Mail scanners that pre-open links therefore cannot use it up.
 *
 * Every check runs before anything is written, and the token is shortened (not deleted) only once the profile is
 * linked, so a failed attempt never costs the person their link.
 */
export async function verifyClaim(formData: FormData): Promise<never> {
  const parsedToken = tokenSchema.safeParse(formData.get("token"));
  if (!parsedToken.success) redirect("/verify-claim?error=invalid");

  const tokenHash = hashToken(parsedToken.data);

  let outcome: ClaimOutcome;
  try {
    outcome = await db.transaction(async (tx): Promise<ClaimOutcome> => {
      const [token] = await tx.select().from(verificationTokens).where(eq(verificationTokens.token, tokenHash)).limit(1);
      if (!token) return { ok: false, reason: "invalid" };
      if (token.expires.getTime() < Date.now()) return { ok: false, reason: "expired" };

      const [user] = await tx
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.email, token.identifier), eq(users.role, "interpreter")))
        .limit(1);
      if (!user) return { ok: false, reason: "unavailable" };

      const [profile] = await tx
        .select({ id: interpreters.id, userId: interpreters.userId })
        .from(interpreters)
        .where(eq(sql`lower(${interpreters.email})`, token.identifier))
        .limit(1);
      // Nobody else's profile can be taken over: it must be unclaimed, or already claimed by this very account.
      if (!profile || (profile.userId !== null && profile.userId !== user.id)) return { ok: false, reason: "unavailable" };

      const firstTime = profile.userId === null;
      if (firstTime) {
        const linked = await tx
          .update(interpreters)
          .set({ userId: user.id, name: user.name, updatedAt: new Date() })
          .where(and(eq(interpreters.id, profile.id), isNull(interpreters.userId)))
          .returning({ id: interpreters.id });
        // Lost a race with another request: roll back, nothing was written.
        if (linked.length === 0) return { ok: false, reason: "unavailable" };
      }

      // Shadow upgrade: every agency that already had this person on its roster now sees the new account. Their
      // existing rows (status included) are kept as they are; only the owner is filled in. No agency is assumed.
      await tx
        .update(agencyInterpreters)
        .set({ userId: user.id, updatedAt: new Date() })
        .where(and(eq(agencyInterpreters.interpreterId, profile.id), isNull(agencyInterpreters.userId)));

      // Retire the link: other links for this address go now, this one after a short grace period.
      await tx
        .delete(verificationTokens)
        .where(and(eq(verificationTokens.identifier, token.identifier), ne(verificationTokens.token, tokenHash)));
      await tx
        .update(verificationTokens)
        .set({ expires: new Date(Math.min(token.expires.getTime(), Date.now() + REUSE_GRACE_MS)) })
        .where(eq(verificationTokens.token, tokenHash));

      return { ok: true, userId: user.id, email: token.identifier, name: user.name, interpreterId: profile.id, firstTime };
    });
  } catch (err) {
    logError("verifyClaim", err);
    redirect("/verify-claim?error=unavailable");
  }

  if (!outcome.ok) redirect(`/verify-claim?error=${outcome.reason}`);

  if (outcome.firstTime) {
    await writeAuditLog({
      userId: outcome.userId,
      userEmail: outcome.email,
      action: "interpreter_profile_claimed",
      details: `interpreterId=${outcome.interpreterId}; verified by email link`,
    });

    // The roster badge comes from the linked login, so the agency now sees a "Registered App User".
    await notifyAgencyAdmins({
      type: "agency",
      href: "/interpreters",
      title: "Profile claimed",
      message: `${(await getInterpreterDisplayName(outcome.interpreterId).catch(() => null)) || outcome.name} confirmed their email and linked an account to the profile you added.`,
    });
    revalidatePath("/interpreters");
  }

  // Not signed in yet? The middleware sends them to log in and then on to this page.
  redirect("/interpreter-home?verified=true");
}
