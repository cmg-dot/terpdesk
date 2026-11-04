import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { presignDownload } from "@/lib/s3";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ requestId: z.string().uuid(), reportId: z.string().regex(/^[a-f0-9]{24}$/) });

/**
 * Opens the signature of a service-verification report that is still waiting for an interpreter (Hours review > "Needs an
 * interpreter"), for agency staff only. Same rules as the timesheet signature route: the file sits in the PRIVATE bucket,
 * this route checks the staff session and redirects to a 5-minute signed link, and anything else is a bare 401 / 404.
 */
export async function GET(_req: Request, { params }: { params: { requestId: string; reportId: string } }) {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return new NextResponse(null, { status: 401 });
  }
  const ids = paramsSchema.safeParse(params);
  if (!ids.success) return new NextResponse(null, { status: 404 });

  try {
    const rows = (await db.execute(sql`
      SELECT e #>> '{signature,storageKey}' AS key, e #>> '{signature,fileName}' AS file_name
      FROM ${requests}, jsonb_array_elements(coalesce(${requests.data} -> 'pendingVerifications', '[]'::jsonb)) e
      WHERE ${requests.id} = ${ids.data.requestId} AND e ->> 'id' = ${ids.data.reportId}
      LIMIT 1
    `)) as unknown as { key: string | null; file_name: string | null }[];
    const row = rows[0];
    // The key must be one this feature generated for THIS request, whatever the JSON says.
    if (!row?.key || !row.key.startsWith(`verification-signatures/${ids.data.requestId}/`)) return new NextResponse(null, { status: 404 });

    const url = await presignDownload(row.key, row.file_name || "signature");
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "verification_signature_opened",
      details: `pending; requestId=${ids.data.requestId}; reportId=${ids.data.reportId}`,
    });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (err) {
    logError("GET /api/verification-signature/pending", err);
    return new NextResponse(null, { status: 404 });
  }
}
