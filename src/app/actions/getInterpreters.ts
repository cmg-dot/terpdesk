"use server";

import { requireRole } from "@/lib/auth/guards";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { getRosterInterpreters } from "@/lib/roster";

/** Interpreters on the staff member's agency roster (approved connections). Used for offers and auto-book. */
export async function getInterpreters() {
  await requireRole("agency");
  return getRosterInterpreters(DEFAULT_AGENCY_ID);
}
