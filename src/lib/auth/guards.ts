import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import type { AppRole } from "@/lib/auth/routes";

/**
 * Server-side authorization for Server Actions. Call at the very top of every non-public action:
 *   await requireRole("agency");
 * Errors are deliberately terse; Next.js hides thrown messages from clients in production anyway.
 */

export const UNAUTHORIZED = "Unauthorized";
export const FORBIDDEN = "Forbidden";

/** Any signed-in user. */
export async function requireSession(): Promise<Session> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error(UNAUTHORIZED);
  return session;
}

/** A signed-in user holding exactly this role. */
export async function requireRole(role: AppRole): Promise<Session> {
  const session = await requireSession();
  if (session.user.role !== role) throw new Error(FORBIDDEN);
  return session;
}

/**
 * An interpreter login that is linked to an interpreters row. `interpreterId` is the only identity
 * interpreter actions should trust; never use an id sent by the client.
 */
export async function requireInterpreter(): Promise<{ session: Session; interpreterId: string }> {
  const session = await requireRole("interpreter");
  const interpreterId = session.user.interpreterId;
  if (!interpreterId) throw new Error("Your login is not linked to an interpreter profile.");
  return { session, interpreterId };
}

/** Result-style actions return this instead of throwing when the caller is not allowed. */
export const NOT_ALLOWED_MESSAGE = "You don't have permission to do this.";

export async function hasRole(role: AppRole): Promise<boolean> {
  try {
    await requireRole(role);
    return true;
  } catch {
    return false;
  }
}

/** The caller may only act on their own interpreter identity (interpreters.id, or the login id when unlinked). */
export function assertOwnInterpreterId(session: Session, candidate: string): void {
  const own = [session.user.interpreterId, session.user.id].filter((v): v is string => Boolean(v));
  if (!own.includes(candidate)) throw new Error(FORBIDDEN);
}
