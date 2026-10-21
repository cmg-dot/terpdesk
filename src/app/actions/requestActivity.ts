"use server";

import { z } from "zod";
import { requireRole, NOT_ALLOWED_MESSAGE } from "@/lib/auth/guards";
import { listActivityForAgency } from "@/lib/requestActivity";
import type { ActivityItem } from "@/lib/requestActivity";
import { logError } from "@/lib/logError";

export type RequestActivityResult = { success: true; items: ActivityItem[] } | { success: false; error: string };

/** The full activity log of one request, for agency staff. */
export async function getRequestActivity(requestId: string): Promise<RequestActivityResult> {
  try {
    await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = z.string().uuid().safeParse(requestId);
  if (!parsed.success) return { success: false, error: "Unknown request." };
  try {
    return { success: true, items: await listActivityForAgency(parsed.data) };
  } catch (err) {
    logError("getRequestActivity", err);
    return { success: false, error: "We could not load the activity for this request." };
  }
}
