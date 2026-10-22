export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agencyInterpreters, interpreters } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { ensureAgencyInterpreterColumns } from "@/lib/agencyInterpreterColumns";
import { writeAuditLog } from "@/lib/audit";
import { requireRole, UNAUTHORIZED } from "@/lib/auth/guards";
import { MAX_IMPORT_ROWS, validateImportRecords } from "@/lib/interpreterImport";
import type { BulkImportResponse } from "@/lib/interpreterImport";
import { logError } from "@/lib/logError";

/**
 * Bulk-creates shadow interpreter profiles from CSV rows the browser parsed (agency staff only).
 *
 * The email is the unique key. Anyone whose email already belongs to an interpreter (compared case-insensitively) is
 * left exactly as they are, never overwritten, so re-uploading the same file creates nothing new and changes nothing.
 * New people go in with one batch INSERT ... ON CONFLICT (email) DO NOTHING, so even two imports running at the same
 * moment cannot create a duplicate. Each new profile is also put on this agency's roster, in the same transaction.
 * Only counts are returned or logged: no names or emails.
 */

const MAX_BODY_BYTES = 400_000;
const bodySchema = z.object({ rows: z.array(z.record(z.unknown())).max(MAX_IMPORT_ROWS) });

const fail = (error: string, status: number) => NextResponse.json<BulkImportResponse>({ success: false, error }, { status });

export async function POST(req: Request): Promise<NextResponse<BulkImportResponse>> {
  let session;
  try {
    session = await requireRole("agency");
  } catch (err) {
    const unauthenticated = err instanceof Error && err.message === UNAUTHORIZED;
    return fail(unauthenticated ? "Please sign in again." : "You don't have permission to import interpreters.", unauthenticated ? 401 : 403);
  }

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return fail("That file is too large to import. Split it into smaller files.", 413);

  let body: z.infer<typeof bodySchema>;
  try {
    const parsedBody = bodySchema.safeParse(await req.json());
    if (!parsedBody.success) return fail(`Send between 1 and ${MAX_IMPORT_ROWS} rows per import.`, 400);
    body = parsedBody.data;
  } catch {
    return fail("The import request was not valid.", 400);
  }

  // The browser already validated, but the server never takes that on trust.
  const { rows, problems, duplicatesInFile } = validateImportRecords(body.rows, { name: "name", email: "email", phone: "phone" });
  if (rows.length === 0) {
    return NextResponse.json<BulkImportResponse>({ success: true, created: 0, skippedExisting: 0, duplicatesInFile, invalid: problems });
  }

  try {
    await ensureAgencyInterpreterColumns();

    // Emails that already belong to an interpreter (any casing: the unique index itself is case-sensitive).
    const existing = await db
      .select({ email: sql<string>`lower(${interpreters.email})` })
      .from(interpreters)
      .where(inArray(sql`lower(${interpreters.email})`, rows.map((r) => r.email)));
    const taken = new Set(existing.map((e) => e.email));
    const fresh = rows.filter((r) => !taken.has(r.email));

    const created = await db.transaction(async (tx) => {
      if (fresh.length === 0) return 0;
      const inserted = await tx
        .insert(interpreters)
        .values(fresh.map((r) => ({ name: r.name, email: r.email, phone: r.phone })))
        .onConflictDoNothing({ target: interpreters.email })
        .returning({ id: interpreters.id });
      if (inserted.length > 0) {
        await tx
          .insert(agencyInterpreters)
          .values(inserted.map((i) => ({ agencyId: DEFAULT_AGENCY_ID, interpreterId: i.id, status: "approved" as const })))
          .onConflictDoNothing();
      }
      return inserted.length;
    });

    const skippedExisting = rows.length - created;
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "interpreters_bulk_import",
      details: `rows=${rows.length}; created=${created}; skippedExisting=${skippedExisting}; invalid=${problems.length}; duplicatesInFile=${duplicatesInFile}`,
    });

    revalidatePath("/interpreters");
    revalidatePath("/requests");

    return NextResponse.json<BulkImportResponse>({ success: true, created, skippedExisting, duplicatesInFile, invalid: problems });
  } catch (err) {
    logError("interpreters bulk import", err);
    return fail("We could not import the interpreters. Nothing was changed. Please try again.", 500);
  }
}
