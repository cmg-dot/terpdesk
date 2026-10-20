import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { files } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { writeAuditLog } from "@/lib/audit";
import { requireSession } from "@/lib/auth/guards";
import { canViewFile, isProfilePhoto } from "@/lib/fileAuthorization";
import { logError } from "@/lib/logError";
import { presignDownload } from "@/lib/s3";

export const dynamic = "force-dynamic";

/**
 * Serves a stored file to someone who is allowed to see it, by redirecting to a fresh 5-minute signed S3 link.
 * This is what `<img src="/api/files/<id>">` points at, so private profile photos can be shown without the bucket
 * ever being public. The same rule as the download action applies (src/lib/fileAuthorization.ts); anything else gets
 * a plain 404 so file ids cannot be probed.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new NextResponse(null, { status: 401 });
  }
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return new NextResponse(null, { status: 404 });

  try {
    await ensureAvailabilityTables();
    const [file] = await db.select().from(files).where(eq(files.id, id.data)).limit(1);
    if (!file || !(await canViewFile(session, file))) return new NextResponse(null, { status: 404 });

    const url = await presignDownload(file.storageKey, file.fileName);
    // Photos load on every page view, so only documents are written to the audit trail.
    if (!isProfilePhoto(file)) {
      await writeAuditLog({
        userId: session.user.id,
        userEmail: session.user.email ?? null,
        action: "file_opened",
        details: `fileId=${file.id}; role=${session.user.role}`,
      });
    }
    // The signed link lasts 5 minutes, so the redirect may be reused for 2 (and only by this browser).
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=120" } });
  } catch (err) {
    logError("GET /api/files/[id]", err);
    return new NextResponse(null, { status: 404 });
  }
}
