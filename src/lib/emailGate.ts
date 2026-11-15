import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { agencyInterpreters, interpreters, users } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { ensureAgencyInterpreterColumns } from "@/lib/agencyInterpreterColumns";

/**
 * Who may receive an operational email (offers, booking confirmations, job updates, timesheet links, staff alerts).
 *
 * - An interpreter (their profile email, or the login linked to it) only when this agency has switched their email
 *   notifications on and they are approved and active on the roster. Everyone else on the roster is "muted".
 * - Anyone else (agency staff) only when they are on EMAIL_ALLOWLIST, if that list is set; with no list, staff are allowed.
 *
 * Self-triggered account emails (sign-up verification, two-step security notices) skip this gate entirely (see sendEmail).
 * Fails closed: if the lookup itself fails, nothing is sent. SERVER ONLY. Never logs the address.
 */

export type RecipientDecision = "allowed" | "muted" | "not_allowlisted";

/** EMAIL_ALLOWLIST: comma-separated addresses, read at call time like EMAIL_SILENT_MODE. Empty or unset = no staff limit. */
function staffAllowlist(): Set<string> | null {
  const list = (process.env.EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? new Set(list) : null;
}

export async function checkRecipient(to: string): Promise<RecipientDecision> {
  const address = to.trim().toLowerCase();
  await ensureAgencyInterpreterColumns();

  const profiles = await db
    .select({
      status: agencyInterpreters.status,
      isActive: agencyInterpreters.isActive,
      enabled: agencyInterpreters.emailNotificationsEnabled,
    })
    .from(interpreters)
    .leftJoin(users, eq(users.id, interpreters.userId))
    .leftJoin(
      agencyInterpreters,
      and(eq(agencyInterpreters.interpreterId, interpreters.id), eq(agencyInterpreters.agencyId, DEFAULT_AGENCY_ID)),
    )
    .where(or(sql`lower(${interpreters.email}) = ${address}`, sql`lower(${users.email}) = ${address}`));

  if (profiles.length > 0) {
    const on = profiles.some((p) => p.status === "approved" && p.isActive === true && p.enabled === true);
    return on ? "allowed" : "muted";
  }

  // An interpreter login with no profile yet is still an interpreter: muted, never treated as staff.
  const [interpreterLogin] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "interpreter"), sql`lower(${users.email}) = ${address}`))
    .limit(1);
  if (interpreterLogin) return "muted";

  const allowlist = staffAllowlist();
  return allowlist && !allowlist.has(address) ? "not_allowlisted" : "allowed";
}
