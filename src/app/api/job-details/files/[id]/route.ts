import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { files } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { resolveJobDetailsLink } from "@/lib/jobDetailsAccess";
import { logError } from "@/lib/logError";
import { presignDownload } from "@/lib/s3";

export const dynamic = "force-dynamic";

/**
 * Opens one prep material from the secure job-details page (no sign-in). Allowed only when the details link is
 * valid, the interpreter is still booked, and the file is a prep file for THAT job shared with interpreters.
 * Redirects to a 5-minute signed link; anything else is a plain 404.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = z.string().uuid().safeParse(params.id);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!id.success || !token) return new NextResponse(null, { status: 404 });

  try {
    const access = await resolveJobDetailsLink(token);
    if (!access.ok) return new NextResponse(null, { status: 404 });

    const [file] = await db
      .select({ key: files.storageKey, fileName: files.fileName })
      .from(files)
      .where(and(eq(files.id, id.data), eq(files.linkedJobId, access.requestId), eq(files.sharedWithInterpreters, true)))
      .limit(1);
    if (!file) return new NextResponse(null, { status: 404 });

    const url = await presignDownload(file.key, file.fileName);
    await writeAuditLog({
      action: "file_opened",
      details: `fileId=${id.data}; via=job-details-link; interpreterId=${access.interpreterId}`,
    });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (err) {
    logError("GET /api/job-details/files/[id]", err);
    return new NextResponse(null, { status: 404 });
  }
}
