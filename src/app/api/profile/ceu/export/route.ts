import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { UNAUTHORIZED, requireInterpreter } from "@/lib/auth/guards";
import { isMissingTable } from "@/lib/availability/personalJobConflict";
import { ceuCsvText } from "@/lib/ceuCsv";
import { applyCeuFilters, parseCeuExportQuery } from "@/lib/ceuFilters";
import { readCeu } from "@/lib/ceuStore";
import { logError } from "@/lib/logError";

/**
 * GET /api/profile/ceu/export: the signed-in interpreter's own CEU transcript as a CSV download. The interpreter id comes from the
 * session only. The page's link passes the view it shows (`q`, `cycle`, `focus`) and the same rules narrow the rows here; with none
 * of them (or anything unrecognised) it is every entry. Never cached. The audit log records that an export happened and how many
 * rows, never their contents. Cells a spreadsheet would read as a formula (=, +, -, @) are escaped.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private" };

export async function GET(request: Request) {
  let own;
  try {
    own = await requireInterpreter();
  } catch (err) {
    const unauthorized = err instanceof Error && err.message === UNAUTHORIZED;
    return new NextResponse(unauthorized ? "Sign in to export your CEU log." : "Not allowed", { status: unauthorized ? 401 : 403, headers: NO_STORE });
  }

  try {
    const { cycles, entries } = await readCeu(own.interpreterId);
    const rows = applyCeuFilters(entries, parseCeuExportQuery(new URL(request.url).searchParams));
    await writeAuditLog({ userId: own.session.user.id, userEmail: own.session.user.email ?? null, action: "ceu_exported", details: `rows=${rows.length}` });
    return new NextResponse(ceuCsvText(rows, cycles), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="terpdesk-ceu-log-${new Date().toISOString().slice(0, 10)}.csv"`,
        ...NO_STORE,
      },
    });
  } catch (err) {
    if (isMissingTable(err)) return new NextResponse("Renewal tracking is not set up on this database yet.", { status: 503, headers: NO_STORE });
    logError("ceuExport", err);
    return new NextResponse("We could not export your CEU log. Please try again.", { status: 500, headers: NO_STORE });
  }
}
