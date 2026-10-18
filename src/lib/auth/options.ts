import bcrypt from "bcryptjs";
import { and, count, eq, gt, sql } from "drizzle-orm";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, interpreters, users } from "@/db/schema";
import { getAuthSecret } from "@/lib/auth/secret";
import { isAppRole } from "@/lib/auth/routes";
import { writeAuditLog } from "@/lib/audit";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOCKED_MESSAGE = "Account temporarily locked due to too many failed attempts. Try again in 15 minutes.";

// Compared against when the email is unknown, so "no such user" and "wrong password" take similar time.
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7Z2m5G3N7uK5QdY8bq3rN1Zc1l3oD3a";

export const authOptions: NextAuthOptions = {
  secret: getAuthSecret(),
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

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

        // Link an interpreter login to its interpreters row (matched by email) so actions can scope data to it.
        let interpreterId: string | null = null;
        if (user.role === "interpreter") {
          // Only the verified link counts. Matching by email here would let anyone who registered with someone
          // else's address act as that interpreter before proving they own it.
          const [linked] = await db.select({ id: interpreters.id }).from(interpreters).where(eq(interpreters.userId, user.id)).limit(1);
          interpreterId = linked?.id ?? null;
        }

        await writeAuditLog({ userId: user.id, userEmail: email, action: "login_success", details: `role=${user.role}` });

        return { id: user.id, email: user.email, name: user.name, role: user.role, interpreterId };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present at sign-in; copy the fields the middleware and UI need into the token.
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.interpreterId = user.interpreterId ?? null;
      } else if (token.role === "interpreter" && !token.interpreterId && token.id) {
        // Not linked at sign-in. Re-check, so verifying the email link takes effect without signing in again.
        // (Costs one small query per request, and only until the profile is linked.)
        const [linked] = await db.select({ id: interpreters.id }).from(interpreters).where(eq(interpreters.userId, token.id)).limit(1);
        if (linked) token.interpreterId = linked.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.interpreterId = token.interpreterId ?? null;
      }
      return session;
    },
  },
};
