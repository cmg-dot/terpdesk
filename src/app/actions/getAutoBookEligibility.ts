"use server";

import { requireRole } from "@/lib/auth/guards";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { readAutoBookAllowedMap } from "@/lib/agencyPermissions";

/** For the dispatch screen: which interpreters have granted this agency auto-book permission. Agency staff only. */
export async function getAutoBookEligibility(interpreterIds: string[]): Promise<Record<string, boolean>> {
  await requireRole("agency");
  const ids = Array.from(new Set(interpreterIds.filter((id) => typeof id === "string" && id.length > 0))).slice(0, 500);
  return readAutoBookAllowedMap(DEFAULT_AGENCY_ID, ids);
}
