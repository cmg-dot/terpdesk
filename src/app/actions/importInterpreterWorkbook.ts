"use server";

import { revalidatePath } from "next/cache";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { ensureAgencyInterpreterColumns } from "@/lib/agencyInterpreterColumns";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { workbookImportInputSchema } from "@/lib/validation/workbookImport";
import { persistMerged } from "@/lib/workbookImport/persist";
import { planImport } from "@/lib/workbookImport/plan";
import { looksLikeXlsx } from "@/lib/workbookImport/readWorkbook";
import type { ImportWorkbookResult } from "@/lib/workbookImport/types";

/**
 * Imports Kari's master workbook: joins "Interpreter State Rate" and "Interpreter non state + emails" on the
 * interpreter name (case-insensitive) and seeds interpreter profiles with their State, King County and Non-state rates.
 *
 * Agency staff only (the app has no separate admin role). The browser sends only the file and a mode: the server
 * re-reads and re-validates the workbook itself every time. mode "preview" runs the real import and rolls it back, so
 * the report matches what "import" will do. Nothing in the audit log or in server logs holds a name or an email.
 */
export async function importInterpreterWorkbook(formData: FormData): Promise<ImportWorkbookResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }

  const input = workbookImportInputSchema.safeParse({ file: formData.get("file"), mode: formData.get("mode") });
  if (!input.success) return { success: false, error: input.error.issues[0]?.message ?? "That upload isn't valid." };
  const { file, mode } = input.data;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!looksLikeXlsx(buffer)) return { success: false, error: "That file isn't a real .xlsx workbook." };

    const plan = await planImport(buffer);
    if (!plan.ok) return { success: false, error: plan.error };
    if (plan.people.length === 0) return { success: false, error: "No interpreters were found on the two sheets." };

    await ensureAvailabilityTables();
    await ensureAgencyInterpreterColumns();
    const outcome = await persistMerged(plan.people, { agencyId: DEFAULT_AGENCY_ID, commit: mode === "import" });

    if (mode === "import") {
      await writeAuditLog({
        userId: session.user.id,
        userEmail: session.user.email ?? null,
        action: "interpreters_workbook_import",
        details: `people=${plan.report.people}; created=${outcome.created}; filledExisting=${outcome.filledExisting}; unchangedExisting=${outcome.unchangedExisting}; skippedNotOnRoster=${outcome.skippedNotOnRoster}; withoutEmail=${plan.report.withoutEmail}; notes=${plan.report.notesTotal}`,
      });
      revalidatePath("/interpreters");
      revalidatePath("/requests");
    }
    return { success: true, mode, report: { ...plan.report, outcome } };
  } catch (err) {
    logError("importInterpreterWorkbook", err);
    return { success: false, error: "We could not read or import that workbook. Nothing was changed. Please try again." };
  }
}
