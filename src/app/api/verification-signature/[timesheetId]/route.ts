import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requests, timesheets } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { presignDownload } from "@/lib/s3";

export const dynamic = "force-dynamic";

/**
 * Opens the signature that came with an ODHH service verification, for agency staff only. The file sits in the
 * PRIVATE bucket; this route is what the review screen's `<img src>` points at. It checks the staff session, finds
 * the stored file through the timesheet's own request, and redirects to a 5-minute signed link. Anything else (not
 * signed in, wrong role, unknown id, no signature) gets a bare 401 / 404 so ids cannot be probed.
 */
export async function GET(_req: Request, { params }: { params: { timesheetId: string } }) {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return new NextResponse(null, { status: 401 });
  }
  const id = z.string().uuid().safeParse(params.timesheetId);
  if (!id.success) return new NextResponse(null, { status: 404 });

  try {
    const [row] = await db
      .select({
        requestId: timesheets.requestId,
        key: sql<string | null>`${requests.data} #>> '{serviceVerification,signature,storageKey}'`,
        fileName: sql<string | null>`${requests.data} #>> '{serviceVerification,signature,fileName}'`,
      })
      .from(timesheets)
      .innerJoin(requests, eq(requests.id, timesheets.requestId))
      .where(eq(timesheets.id, id.data))
      .limit(1);
    // The key must be one this feature generated for THIS request, whatever the JSON says.
    if (!row?.key || !row.key.startsWith(`verification-signatures/${row.requestId}/`)) return new NextResponse(null, { status: 404 });

    const url = await presignDownload(row.key, row.fileName || "signature");
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "verification_signature_opened",
      details: `timesheetId=${id.data}; requestId=${row.requestId}`,
    });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (err) {
    logError("GET /api/verification-signature/[timesheetId]", err);
    return new NextResponse(null, { status: 404 });
  }
}
