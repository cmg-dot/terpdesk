"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { timesheets } from "@/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { buildDashboardSummary } from "@/lib/dashboardSummary";
import type { DashboardSummary } from "@/lib/dashboardSummary";
import { countHoursAwaitingReview } from "@/lib/hoursAwaitingCount";
import { loadRequestRows } from "@/lib/requestRows";

/**
 * Everything the dashboard shows, in ONE call: the six card figures, worked out here with the same predicates the list filters use,
 * and the jobs that have not ended yet (the only ones its three lists can show). The browser no longer downloads every request and
 * every timesheet to count them. The requests and the submitted-timesheet ids are read together. Agency only; read only.
 */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  await requireRole("agency");
  const [rows, submitted] = await Promise.all([
    loadRequestRows("open"),
    db.select({ timesheetId: timesheets.id, requestId: timesheets.requestId }).from(timesheets).where(eq(timesheets.status, "submitted")),
  ]);
  return buildDashboardSummary(rows, countHoursAwaitingReview(rows, submitted), Date.now());
}
