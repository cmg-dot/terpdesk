import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/db";
import { availabilityShares } from "@/db/schema";
import { NO_PERMISSIONS } from "@/lib/agencyPermissionTypes";
import type { AgencyPermission } from "@/lib/agencyPermissionTypes";

/**
 * Per-agency permissions an interpreter grants live on `availability_shares` (one row per agency + interpreter):
 *  - `enabled`         = "Share my availability" (what the availability engine already reads)
 *  - `allows_auto_book` = "Allow this agency to auto-book me" (only meaningful while sharing is on)
 * Nothing here touches the availability rules, busy time or time zone tables.
 *
 * SERVER ONLY: this file queries the database. Client code must import from `agencyPermissionTypes` instead.
 */

export const agencyIdSchema = z.string().trim().min(1).max(100);

export async function readPermission(agencyId: string, interpreterId: string): Promise<AgencyPermission> {
  const [row] = await db
    .select({ enabled: availabilityShares.enabled, allowsAutoBook: availabilityShares.allowsAutoBook })
    .from(availabilityShares)
    .where(and(eq(availabilityShares.agencyId, agencyId), eq(availabilityShares.interpreterId, interpreterId)))
    .limit(1);
  // No row means the interpreter has never switched anything on, which the UI treats as "off".
  return row ? { sharesAvailability: row.enabled, allowsAutoBook: row.enabled && row.allowsAutoBook } : NO_PERMISSIONS;
}

/** Sets sharing for one agency. Turning it off always turns auto-book off too. */
export async function writeSharing(agencyId: string, interpreterId: string, enabled: boolean): Promise<AgencyPermission> {
  const [existing] = await db
    .select({ id: availabilityShares.id })
    .from(availabilityShares)
    .where(and(eq(availabilityShares.agencyId, agencyId), eq(availabilityShares.interpreterId, interpreterId)))
    .limit(1);

  const values = enabled ? { enabled } : { enabled, allowsAutoBook: false };
  if (existing) {
    await db.update(availabilityShares).set(values).where(eq(availabilityShares.id, existing.id));
  } else {
    await db.insert(availabilityShares).values({ id: randomUUID(), agencyId, interpreterId, enabled, allowsAutoBook: false });
  }
  return readPermission(agencyId, interpreterId);
}

/** Which of these interpreters currently let the agency auto-book them (sharing on AND auto-book on). */
export async function readAutoBookAllowedMap(agencyId: string, interpreterIds: string[]): Promise<Record<string, boolean>> {
  if (interpreterIds.length === 0) return {};
  const rows = await db
    .select({ interpreterId: availabilityShares.interpreterId, enabled: availabilityShares.enabled, allowsAutoBook: availabilityShares.allowsAutoBook })
    .from(availabilityShares)
    .where(and(eq(availabilityShares.agencyId, agencyId), inArray(availabilityShares.interpreterId, interpreterIds)));
  const allowed: Record<string, boolean> = {};
  for (const row of rows) allowed[row.interpreterId] = row.enabled && row.allowsAutoBook;
  return allowed;
}
