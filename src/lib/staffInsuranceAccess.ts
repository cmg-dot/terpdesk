import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";
import { db } from "@/db";
import { agencyInterpreters, credentials, interpreters } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { requireRole } from "@/lib/auth/guards";

/**
 * Who may record an interpreter's commercial auto policy for them: agency staff, for an interpreter on this agency's roster who has
 * no terpDESK login (a shadow profile such as one imported from the workbook). An interpreter with a login keeps their insurance on
 * their own profile, so staff can never overwrite it. Never by id alone: the roster connection is checked every time. SERVER ONLY.
 */

export type StaffInsuranceAccess = { ok: true; session: Session; interpreterId: string } | { ok: false; error: string };

export async function staffForLoginlessInterpreter(interpreterId: string): Promise<StaffInsuranceAccess> {
  let session: Session;
  try {
    session = await requireRole("agency");
  } catch {
    return { ok: false, error: "You don't have permission to do this." };
  }
  const [row] = await db
    .select({ userId: interpreters.userId })
    .from(interpreters)
    .innerJoin(agencyInterpreters, and(eq(agencyInterpreters.interpreterId, interpreters.id), eq(agencyInterpreters.agencyId, DEFAULT_AGENCY_ID), eq(agencyInterpreters.status, "approved")))
    .where(eq(interpreters.id, interpreterId))
    .limit(1);
  if (!row) return { ok: false, error: "That interpreter isn't on your roster." };
  if (row.userId) return { ok: false, error: "This interpreter has a terpDESK login and keeps their insurance on their own profile." };
  return { ok: true, session, interpreterId };
}

/** The interpreter's active commercial auto policy, when it is the given one (files attach only to it). */
export async function activeCommercialAuto(interpreterId: string, credentialId?: string): Promise<{ id: string } | null> {
  const conditions = [eq(credentials.interpreterId, interpreterId), eq(credentials.isArchived, false), eq(credentials.insuranceKind, "commercial_auto")];
  if (credentialId) conditions.push(eq(credentials.id, credentialId));
  const [row] = await db.select({ id: credentials.id }).from(credentials).where(and(...conditions)).limit(1);
  return row ?? null;
}
