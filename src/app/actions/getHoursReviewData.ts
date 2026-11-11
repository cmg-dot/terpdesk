"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { loadHoursReviewData } from "@/lib/hoursReviewLoader";
import type { HoursReviewData } from "@/lib/hoursReviewLoader";

const MAX_CACHED_IDS = 2000;
const idListSchema = z.array(z.string()).max(MAX_CACHED_IDS);
const uuidSchema = z.string().uuid();

/**
 * What the hours review merges into its records: the submitted and approved timesheets and only the requests that can hold hours (about
 * 8% of them), cut down to the fields the merge reads. `cachedRequestIds` are the jobs named by the browser's cached records, so the
 * merge keeps or drops each cached record as it always did; anything that is not a valid id is ignored. Agency only; read only.
 */
export async function fetchHoursReviewData(cachedRequestIds: string[] = []): Promise<HoursReviewData> {
  await requireRole("agency");
  const parsed = idListSchema.safeParse(cachedRequestIds);
  const ids = parsed.success ? Array.from(new Set(parsed.data.filter((id) => uuidSchema.safeParse(id).success))) : [];
  return loadHoursReviewData(ids);
}
