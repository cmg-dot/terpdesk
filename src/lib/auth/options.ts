import bcrypt from "bcryptjs";
import { and, count, eq, gt, sql } from "drizzle-orm";
import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, interpreters, users } from "@/db/schema";
import { interpreterDisplayName } from "@/lib/displayNameSql";
import { getAuthSecret } from "@/lib/auth/secret";
import { ensureValidAuthUrl } from "@/lib/baseUrl";
import { LOCKED_MESSAGE, WRONG_PORTAL_MESSAGES } from "@/lib/auth/messages";
import { isAppRole } from "@/lib/auth/routes";
import { writeAuditLog } from "@/lib/audit";
import { isIdleExpired, isTouchUpdate } from "@/lib/auth/idle";
import { enforceSecondFactor } from "@/lib/mfa/loginGate";
import { themeForRole } from "@/lib/theme";
import { readSavedTheme } from "@/lib/themeStore";

// Runs before NextAuth ever reads NEXTAUTH_URL, so a missing/malformed value cannot throw "Invalid URL".
ensureValidAuthUrl();

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
  // Which sign-in portal was used. Required: every sign-in goes through the agency or the interpreter portal.
  portal: z.enum(["agency", "interpreter"]),
  // The two-step verification code (or a recovery code), sent on the second submit of the sign-in form. Empty, or the text
  // "undefined" / "null" (what a client library makes of a missing value), means no code was sent.
  code: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => (value && value !== "undefined" && value !== "null" ? value : undefined)),
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

// Compared against when the email is unknown, so "no such user" and "wrong password" take similar time.
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7Z2m5G3N7uK5QdY8bq3rN1Zc1l3oD3a";

/**
 * The name to show for this login: an interpreter's preferred name (else the account name); staff use the account
 * name. Returns undefined when the lookup fails, so a database hiccup is retried on the next request instead of
 * being cached in the cookie.
 */
async function resolveDisplayName(token: JWT): Promise<string | undefined> {
  if (token.role === "interpreter" && token.interpreterId) {
    try {
      const [row] = await db
        .select({ name: interpreterDisplayName })
        .from(interpreters)
        .where(eq(interpreters.id, token.interpreterId))
        .limit(1);
      if (row?.name) return row.name;
    } catch {
      return undefined;
    }
  }
  return token.name ?? "";
}

export const authOptions: NextAuthOptions = {
  secret: getAuthSecret(),
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  // signOut: NextAuth's own sign-out confirmation is unstyled, so its URL is served by our page instead.
  pages: { signIn: "/login", signOut: "/signout" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        portal: { label: "Portal", type: "text" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password, portal, code } = parsed.data;

        // Brute-force protection: checked before any password work, and by submitted email, so an
        // unknown address is locked exactly like a real one (no way to tell them apart).
        const [recent] = await db
          .select({ failures: count() })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.action, "login_failed"),
              eq(auditLogs.userEmail, email),
              gt(auditLogs.createdAt, new Date(Date.now() - LOCKOUT_WINDOW_MS)),
            ),
          );
        if (Number(recent?.failures ?? 0) >= MAX_FAILED_ATTEMPTS) throw new Error(LOCKED_MESSAGE);

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !passwordOk || !isAppRole(user.role)) {
          await writeAuditLog({ userId: user?.id ?? null, userEmail: email, action: "login_failed", details: "invalid credentials" });
          return null;
        }

        // Right password, wrong portal: refused here, before a session exists, so nobody is ever signed in through
        // the other role's portal. Not counted as a failed attempt (the password was right). The message names the
        // right portal; it is only reachable with the correct password, so it reveals nothing about other accounts.
        if (user.role !== portal) {
          await writeAuditLog({ userId: user.id, userEmail: email, action: "login_wrong_portal", details: `role=${user.role}; portal=${portal}` });
          throw new Error(WRONG_PORTAL_MESSAGES[portal]);
        }

        // Two-step verification (agency staff who turned it on in Settings): asked for after the password was right.
        // Throws a displayable message to ask for the code or to refuse a wrong one; a login that never enrolled is unaffected.
        const second: { method: "totp" | "recovery" | null; deviceId?: string } = user.role === "agency" ? await enforceSecondFactor({ id: user.id, email }, code) : { method: null };

        // Link an interpreter login to its interpreters row (matched by email) so actions can scope data to it.
        let interpreterId: string | null = null;
        if (user.role === "interpreter") {
          // Only the verified link counts. Matching by email here would let anyone who registered with someone
          // else's address act as that interpreter before proving they own it.
          const [linked] = await db.select({ id: interpreters.id }).from(interpreters).where(eq(interpreters.userId, user.id)).limit(1);
          interpreterId = linked?.id ?? null;
        }

        await writeAuditLog({ userId: user.id, userEmail: email, action: "login_success", details: `role=${user.role}${second.method ? `; mfa=${second.method}` : ""}${second.deviceId ? `; device=${second.deviceId}` : ""}` });

        return { id: user.id, email: user.email, name: user.name, role: user.role, interpreterId };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // The browser's "still here" ping (update({ touch: true })): only moves the activity clock, no database work. A token
      // that has already been idle past the limit is NOT revived by a late ping; it stays expired.
      if (trigger === "update" && isTouchUpdate(session)) {
        if (!isIdleExpired(token)) token.lastActivityAt = Date.now();
        return token;
      }
      // `user` is only present at sign-in; copy the fields the middleware and UI need into the token.
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.interpreterId = user.interpreterId ?? null;
        token.displayName = undefined;
        token.lastActivityAt = Date.now();
      } else if (token.role === "interpreter" && !token.interpreterId && token.id) {
        // Not linked at sign-in. Re-check, so verifying the email link takes effect without signing in again.
        // (Costs one small query per request, and only until the profile is linked.)
        const [linked] = await db.select({ id: interpreters.id }).from(interpreters).where(eq(interpreters.userId, token.id)).limit(1);
        if (linked) {
          token.interpreterId = linked.id;
          token.displayName = undefined;
        }
      }
      // The client calls update() after the profile is saved: read the name again instead of trusting the cookie.
      if (trigger === "update") {
        token.displayName = undefined;
        token.theme = undefined;
      }
      // A token issued before idle tracking existed is stamped the first time it is re-issued (one-time, at deploy).
      if (token.lastActivityAt === undefined) token.lastActivityAt = Date.now();
      // Looked up once, then carried in the token, so the very first paint already has the right name.
      if (token.displayName === undefined) token.displayName = await resolveDisplayName(token);
      // The saved workspace theme (agency staff only), carried the same way so the root layout needs no query of its own.
      if (token.theme === undefined && token.role === "agency") token.theme = await readSavedTheme(token.id);
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.interpreterId = token.interpreterId ?? null;
        session.user.displayName = token.displayName ?? token.name ?? "";
        session.user.theme = themeForRole(token.role, token.theme);
        // Read by the server guards and the root layout: an idle agency login is signed out even though its cookie is still valid.
        session.user.idleExpired = isIdleExpired(token);
      }
      return session;
    },
  },
};
