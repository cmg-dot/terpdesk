"use server";

import { requireRole } from "@/lib/auth/guards";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { getRosterInterpreters } from "@/lib/roster";

/** Interpreters the staff member can dispatch to: approved and not archived. */
export async function getInterpreters() {
  await requireRole("agency");
  return getRosterInterpreters(DEFAULT_AGENCY_ID, { activeOnly: true });
}
