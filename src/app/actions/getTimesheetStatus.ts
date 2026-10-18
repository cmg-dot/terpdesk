"use server";

import { requireRole } from "@/lib/auth/guards";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { timesheets } from "@/db/schema";

export interface TimesheetFlags {
  /** A timesheet link has been created and emailed for this interpreter. */
  dispatched: boolean;
  /** The interpreter submitted hours and the agency has not reviewed them yet. */
  submitted: boolean;
  approved: boolean;
}

const requestIdSchema = z.string().uuid();

/** Timesheet state per interpreter for one request, keyed by interpreter id. */
export async function getTimesheetStatus(requestId: string): Promise<Record<string, TimesheetFlags>> {
  await requireRole("agency");
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return {};

  const rows = await db
    .select({ interpreterId: timesheets.interpreterId, status: timesheets.status })
    .from(timesheets)
    .where(eq(timesheets.requestId, parsed.data));

  const result: Record<string, TimesheetFlags> = {};
  for (const row of rows) {
    const flags = result[row.interpreterId] ?? { dispatched: false, submitted: false, approved: false };
    flags.dispatched = true;
    if (row.status === "submitted") flags.submitted = true;
    if (row.status === "approved") flags.approved = true;
    result[row.interpreterId] = flags;
  }
  return result;
}
