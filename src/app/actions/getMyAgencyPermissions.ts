"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { availabilityShares } from "@/db/schema";
import { requireInterpreter } from "@/lib/auth/guards";
import type { AgencyPermission } from "@/lib/agencyPermissionTypes";

/** The signed-in interpreter's permissions, keyed by agency id. Agencies with no row are simply absent (= off). */
export async function getMyAgencyPermissions(): Promise<Record<string, AgencyPermission>> {
  const { interpreterId } = await requireInterpreter();
  const rows = await db
    .select({ agencyId: availabilityShares.agencyId, enabled: availabilityShares.enabled, allowsAutoBook: availabilityShares.allowsAutoBook })
    .from(availabilityShares)
    .where(eq(availabilityShares.interpreterId, interpreterId));

  const result: Record<string, AgencyPermission> = {};
  for (const row of rows) {
    result[row.agencyId] = { sharesAvailability: row.enabled, allowsAutoBook: row.enabled && row.allowsAutoBook };
  }
  return result;
}
