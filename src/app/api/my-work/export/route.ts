import { NextResponse } from "next/server";
import Papa from "papaparse";
import { writeAuditLog } from "@/lib/audit";
import { UNAUTHORIZED, requireInterpreter } from "@/lib/auth/guards";
import { isMissingTable } from "@/lib/availability/personalJobConflict";
import { logError } from "@/lib/logError";
import { PERSONAL_JOB_CSV_HEADER, personalJobCsvRows } from "@/lib/personalJobs";
import { readPersonalJobs } from "@/lib/personalJobsStore";

/**
 * GET /api/my-work/export: the signed-in interpreter's own personal jobs as a CSV download (one row per job: date, times, setting,
 * label, break, hours worked, miles, round trip, counted miles). The interpreter id comes from the session only. There are no rates,
 * earnings or payer, so the only free text is the label the interpreter chose to enter; it is never cached, and the audit log records
 * that an export happened and how many rows, never their contents. Cells a spreadsheet would read as a formula (=, +, -, @) are escaped.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  let own;
  try {
    own = await requireInterpreter();
  } catch (err) {
    return new NextResponse(err instanceof Error && err.message === UNAUTHORIZED ? "Sign in to export your work." : "Not allowed", {
      status: err instanceof Error && err.message === UNAUTHORIZED ? 401 : 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const jobs = await readPersonalJobs(own.interpreterId);
    const csv = Papa.unparse({ fields: [...PERSONAL_JOB_CSV_HEADER], data: personalJobCsvRows(jobs) }, { escapeFormulae: true, newline: "\r\n" });
    await writeAuditLog({
      userId: own.session.user.id,
      userEmail: own.session.user.email ?? null,
      action: "personal_jobs_exported",
      details: `rows=${jobs.length}`,
    });
    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="terpdesk-personal-jobs-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (isMissingTable(err)) return new NextResponse("My work is not set up on this database yet.", { status: 409, headers: { "Cache-Control": "no-store" } });
    logError("my-work export", err);
    return new NextResponse("Could not build the export. Please try again.", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
