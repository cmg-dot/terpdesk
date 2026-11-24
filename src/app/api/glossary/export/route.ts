import { NextResponse } from "next/server";
import Papa from "papaparse";
import { writeAuditLog } from "@/lib/audit";
import { UNAUTHORIZED, requireInterpreter } from "@/lib/auth/guards";
import { isMissingTable } from "@/lib/availability/personalJobConflict";
import { GLOSSARY_CSV_HEADER, glossaryCsvRows } from "@/lib/glossary";
import { applyGlossaryFilters, parseGlossaryExportQuery } from "@/lib/glossaryFilters";
import { readGlossaryTerms } from "@/lib/glossaryStore";
import { logError } from "@/lib/logError";

/**
 * GET /api/glossary/export: the signed-in interpreter's own glossary as a CSV download, in the columns the import reads back. The
 * interpreter id comes from the session only. The page's link passes the view it shows (`q`, `pair`, `setting`) and the same rules
 * narrow the rows here; with none of them (or anything unrecognised) it is every term. Never cached. The audit log records that an
 * export happened and how many rows, never their contents. Cells a spreadsheet would read as a formula (=, +, -, @) are escaped.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private" };

export async function GET(request: Request) {
  let own;
  try {
    own = await requireInterpreter();
  } catch (err) {
    const unauthorized = err instanceof Error && err.message === UNAUTHORIZED;
    return new NextResponse(unauthorized ? "Sign in to export your glossary." : "Not allowed", { status: unauthorized ? 401 : 403, headers: NO_STORE });
  }

  try {
    const all = await readGlossaryTerms(own.interpreterId);
    const terms = applyGlossaryFilters(all, parseGlossaryExportQuery(new URL(request.url).searchParams));
    const csv = Papa.unparse({ fields: [...GLOSSARY_CSV_HEADER], data: glossaryCsvRows(terms) }, { escapeFormulae: true, newline: "\r\n" });
    await writeAuditLog({ userId: own.session.user.id, userEmail: own.session.user.email ?? null, action: "glossary_exported", details: `rows=${terms.length}` });
    return new NextResponse(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="terpdesk-glossary-${new Date().toISOString().slice(0, 10)}.csv"`,
        ...NO_STORE,
      },
    });
  } catch (err) {
    if (isMissingTable(err)) return new NextResponse("The glossary is not set up on this database yet.", { status: 503, headers: NO_STORE });
    logError("glossaryExport", err);
    return new NextResponse("We could not export your glossary. Please try again.", { status: 500, headers: NO_STORE });
  }
}
