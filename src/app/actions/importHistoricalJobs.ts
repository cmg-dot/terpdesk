"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { planJobs } from "@/lib/jobImport/plan";
import { persistJobs } from "@/lib/jobImport/persist";
import { loadRosterCandidates } from "@/lib/jobImport/roster";
import { JOBS_SHEET } from "@/lib/jobImport/types";
import type { ImportJobsResult } from "@/lib/jobImport/types";
import { logError } from "@/lib/logError";
import { jobsImportInputSchema } from "@/lib/validation/jobsImport";
import { looksLikeXlsx, readSingleSheet } from "@/lib/workbookImport/readWorkbook";

/**
 * Imports the agency's historical jobs from the "Jobs" sheet of the master workbook: reads each row's date and
 * start/end times as strict timestamps, splits cells that name several interpreters ("A & B", "A / B", "A and B"),
 * matches each name to the roster, and creates the job plus an accepted booking for every matched interpreter.
 *
 * Agency staff only. The browser sends only the file and two choices; the server re-reads and re-validates the workbook
 * every time. mode "preview" runs the real import and rolls it back, so the report matches what "import" will do.
 * Nothing is emailed or notified. The audit log holds counts only, never names.
 */
export async function importHistoricalJobs(formData: FormData): Promise<ImportJobsResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }

  const input = jobsImportInputSchema.safeParse({ file: formData.get("file"), mode: formData.get("mode"), allowPartial: formData.get("allowPartial") ?? "true" });
  if (!input.success) return { success: false, error: input.error.issues[0]?.message ?? "That upload isn't valid." };
  const { file, mode, allowPartial } = input.data;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!looksLikeXlsx(buffer)) return { success: false, error: "That file isn't a real .xlsx workbook." };

    const sheet = await readSingleSheet(buffer, JOBS_SHEET);
    if (!sheet.ok) return { success: false, error: sheet.error };

    const roster = await loadRosterCandidates(DEFAULT_AGENCY_ID);
    const plan = planJobs(sheet.data, roster, allowPartial);
    if (!plan.ok) return { success: false, error: plan.error };
    if (plan.jobs.length === 0) return { success: false, error: `No usable job rows were found on the "${JOBS_SHEET}" sheet.` };

    const outcome = await persistJobs(plan.jobs, { commit: mode === "import" });

    if (mode === "import") {
      await writeAuditLog({
        userId: session.user.id,
        userEmail: session.user.email ?? null,
        action: "jobs_workbook_import",
        details: `rows=${plan.report.rowsRead}; skipped=${plan.report.rowsSkipped}; created=${outcome.created}; assignments=${outcome.assignments}; alreadyImported=${outcome.alreadyImported}; partialMatching=${allowPartial}; unmatchedNames=${plan.report.names.unmatched + plan.report.names.ambiguous}`,
      });
      for (const path of ["/requests", "/dashboard", "/calendar", "/jobs", "/interpreter-home", "/interpreter-calendar", "/billing", "/hours-review"]) revalidatePath(path);
    }
    return { success: true, mode, report: { ...plan.report, outcome } };
  } catch (err) {
    logError("importHistoricalJobs", err);
    return { success: false, error: "We could not read or import the jobs. Nothing was changed. Please try again." };
  }
}
