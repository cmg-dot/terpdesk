import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { userSecurity } from "@/db/schema";
import { getAuthSecret } from "@/lib/auth/secret";
import { getBaseUrl } from "@/lib/baseUrl";
import { logError } from "@/lib/logError";

/**
 * Ending sessions after a password reset or change. SERVER ONLY. Sessions are signed cookies (JWT), so nothing is stored per session:
 * each sign-in token carries `authAt` (when the password was entered) and a random `sid`, and `user_security` records, per login, the
 * moment before which sign-ins no longer count, plus at most one session that is exempt (the one that changed its own password).
 * The NextAuth jwt callback asks `isSessionRevoked` on every request; a revoked token makes it throw, which NextAuth turns into
 * "signed out" (no session, and the cookie is cleared the next time the browser asks for its session).
 */

type Executor = Pick<typeof db, "insert">;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The thrown message for a refused token. Generic: it is only logged by NextAuth, never shown. */
export const SESSION_REVOKED = "Session ended after a password change";

/** A new session's id, stamped into the token at sign-in. */
export const newSessionId = (): string => randomUUID();

/** The fields of a sign-in token this module reads. */
export interface RevocationTokenFields {
  id?: unknown;
  sid?: unknown;
  authAt?: unknown;
}

/**
 * True when this token was issued before the login's password was reset or changed, and it is not the one session kept by that change.
 * A token from before this feature has no `authAt` and counts as issued at time 0. Fails open on a database error (logged, not thrown):
 * one failed lookup must not sign everybody out. A login with no `user_security` row never had a session ended.
 */
export async function isSessionRevoked(token: RevocationTokenFields): Promise<boolean> {
  if (typeof token.id !== "string" || !token.id) return false;
  try {
    const [row] = await db
      .select({ after: userSecurity.sessionsValidAfter, kept: userSecurity.keptSessionId })
      .from(userSecurity)
      .where(eq(userSecurity.userId, token.id))
      .limit(1);
    if (!row) return false;
    if (typeof token.sid === "string" && row.kept !== null && token.sid === row.kept) return false;
    const authAt = typeof token.authAt === "number" && Number.isFinite(token.authAt) ? token.authAt : 0;
    return authAt < row.after.getTime();
  } catch (err) {
    logError("isSessionRevoked", err);
    return false;
  }
}

/**
 * Ends every session of this login that exists right now, except `keepSessionId` when given (the session that changed its own
 * password). A reset passes null: every session ends. Uses the app server's clock, the same clock that stamps `authAt`.
 */
export async function endSessions(exec: Executor | Tx, userId: string, keepSessionId: string | null): Promise<void> {
  const now = new Date();
  await exec
    .insert(userSecurity)
    .values({ userId, sessionsValidAfter: now, keptSessionId: keepSessionId })
    .onConflictDoUpdate({ target: userSecurity.userId, set: { sessionsValidAfter: now, keptSessionId: keepSessionId } });
}

/**
 * The `sid` of the session making this request (a Server Action), read straight from the signed cookie. Null when there is none, or
 * for a token from before `sid` existed: then that session is not kept and ends like the others.
 */
export async function currentSessionId(): Promise<string | null> {
  try {
    const req = new NextRequest(new URL("/", getBaseUrl()), { headers: new Headers(headers()) });
    const token = await getToken({ req, secret: getAuthSecret() });
    return typeof token?.sid === "string" ? token.sid : null;
  } catch {
    return null;
  }
}
