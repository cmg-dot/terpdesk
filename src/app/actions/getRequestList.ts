"use server";

import { requireRole } from "@/lib/auth/guards";
import { loadRequestRows } from "@/lib/requestRows";
import { toListRow } from "@/lib/requestListRow";
import type { RequestListRow } from "@/lib/requestListRow";

/**
 * Every request as a lean list row: what the Requests list and the calendar show, without the whole data blob, the copied detail
 * trees, the requester's contact details or settled offers (see requestListRow.ts). A fraction of the size of the whole record
 * (which only fetchLiveRequestById, for one request's page, returns). Agency only; read only.
 */
export async function fetchRequestList(): Promise<RequestListRow[]> {
  await requireRole("agency");
  const rows = await loadRequestRows("open");
  return rows.map(toListRow);
}
