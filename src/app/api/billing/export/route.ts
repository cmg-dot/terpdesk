import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { invoiceCsv, payrollCsv } from "@/lib/billing/csv";
import { BILLING_ENABLED } from "@/lib/billing/enabled";
import { loadBillingView } from "@/lib/billing/view";
import { logError } from "@/lib/logError";

/**
 * GET /api/billing/export?kind=payroll|invoices&period=<id>: the period's ledger as CSV, downloaded. Agency staff only. Payroll
 * carries no PHI; the invoice file carries the HCA ProviderOne fields, so it is never cached and every download is audited (counts
 * only, never its contents).
 */

export const dynamic = "force-dynamic";

const query = z.object({ kind: z.enum(["payroll", "invoices"]), period: z.string().max(60).optional() });

export async function GET(request: NextRequest) {
  if (!BILLING_ENABLED) return new NextResponse("Not found", { status: 404 });
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return new NextResponse("Not allowed", { status: 403 });
  }
  const parsed = query.safeParse({ kind: request.nextUrl.searchParams.get("kind"), period: request.nextUrl.searchParams.get("period") ?? undefined });
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  try {
    const view = await loadBillingView(DEFAULT_AGENCY_ID, parsed.data.period);
    if (!view.ready) return new NextResponse("Billing is not set up on this database yet.", { status: 409 });
    const { kind } = parsed.data;
    const csv = kind === "payroll" ? payrollCsv(view.payroll) : invoiceCsv(view.invoices);
    const rows = kind === "payroll" ? view.payroll.reduce((n, g) => n + g.rows.length, 0) : view.invoices.reduce((n, g) => n + g.jobs.length, 0);
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: kind === "payroll" ? "billing_payroll_exported" : "billing_invoices_exported",
      details: `period=${view.period.start}..${view.period.end}; rows=${rows}`,
    });
    return new NextResponse(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="terpdesk-${kind}-${view.period.start}-to-${view.period.end}.csv"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logError("billing export", error);
    return new NextResponse("Could not build the export. Please try again.", { status: 500 });
  }
}
