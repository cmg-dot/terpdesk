export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { rejectUnlessIntakeAuthorized } from "@/lib/intakeAuth";
import { summarizeJob } from "@/lib/jobSummary";
import { logError } from "@/lib/logError";
import { notifyAgencyAdmins } from "@/lib/notifications";
import { buildPublicRequest, parsePublicIntake } from "@/lib/publicIntake";
import type { FieldProblem } from "@/lib/publicIntake";
import { logActivity } from "@/lib/requestActivity";
import { formatReference } from "@/utils/statusEngine";

/**
 * Server-to-server endpoint for the public client intake form (the ASL Professionals website).
 *
 * POST /api/intake/public   header: x-api-key = INTAKE_API_KEY   body: flat JSON (see lib/publicIntake.ts)
 *
 * Saves ONE new request with status 'draft' so agency staff review it before anything is offered. Never books,
 * never sends offers. The title is generated from the generic setting. Only the listed fields are read; anything else
 * is ignored and reported by name. No request content is ever logged (HIPAA): the log has the request id only.
 * Browsers are not supported on purpose (no CORS): the form's own server makes this call, so the key stays secret.
 */

const MAX_BODY_BYTES = 64 * 1024;
const SOURCE_CHANNEL = "public_intake_form";

type PublicIntakeResponse =
  | { success: true; id: string; reference: string; duplicate: boolean; ignoredFields?: string[] }
  | { success: false; error: string; fields?: FieldProblem[] };

const fail = (error: string, status: number, fields?: FieldProblem[]) =>
  NextResponse.json<PublicIntakeResponse>({ success: false, error, ...(fields ? { fields } : {}) }, { status });

export async function POST(req: Request): Promise<NextResponse<PublicIntakeResponse | { success: false; error: string }>> {
  try {
    const denied = rejectUnlessIntakeAuthorized(req, "Public Intake", "INTAKE_API_KEY");
    if (denied) return denied;

    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return fail("Request body is too large.", 413);
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return fail("Request body is too large.", 413);

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail("Request body must be valid JSON.", 400);
    }

    const parsed = parsePublicIntake(body);
    if (!parsed.ok) return fail("Some fields are missing or not valid.", 422, parsed.fields);

    const draft = buildPublicRequest(parsed.data);
    const submissionId = parsed.data.submissionId;

    // One transaction. With a submissionId, a retry of the same submission (a timeout, a double click) returns the
    // first request instead of creating a second; the advisory lock makes two retries at the same moment safe too.
    const saved = await db.transaction(async (tx) => {
      if (submissionId) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`public-intake:${submissionId}`}))`);
        const [existing] = await tx
          .select({ id: requests.id })
          .from(requests)
          .where(
            sql`${requests.data} #>> '{source,channel}' = ${SOURCE_CHANNEL} AND ${requests.data} #>> '{source,submissionId}' = ${submissionId}`,
          )
          .limit(1);
        if (existing) return { id: existing.id, duplicate: true };
      }
      const [row] = await tx
        .insert(requests)
        .values({
          title: draft.title,
          // 'draft' = awaiting agency review. Never a state job: the program is always General.
          status: "draft",
          isStateJob: false,
          // The app reads createdAt as the appointment start (same as the agency form).
          createdAt: new Date(draft.startsAt),
          data: draft.data,
        })
        .returning({ id: requests.id });
      return { id: row.id, duplicate: false };
    });

    const reference = formatReference(saved.id);
    const ignoredFields = parsed.ignoredFields.length > 0 ? parsed.ignoredFields : undefined;
    if (saved.duplicate) {
      return NextResponse.json<PublicIntakeResponse>({ success: true, id: saved.id, reference, duplicate: true, ignoredFields }, { status: 200 });
    }

    await logActivity({ requestId: saved.id, kind: "created", audience: "shared", message: "Request created", actorLabel: "Public intake form" });

    // Tell staff there is something to review. Reference, date and generic setting only: nothing about the client.
    const summary = summarizeJob({ id: saved.id, title: draft.title, createdAt: new Date(draft.startsAt), data: draft.data });
    await notifyAgencyAdmins({
      type: "job",
      href: `/requests/${saved.id}`,
      title: "New request from the public form",
      message: `${reference} · ${summary.dateLabel} · ${summary.setting}. Review it before it goes live.`,
    });

    for (const path of ["/requests", "/dashboard", "/calendar"]) revalidatePath(path);

    // HIPAA: the id only. No names, dates, locations or notes.
    console.log("[Public Intake] Draft request created", { id: saved.id });
    return NextResponse.json<PublicIntakeResponse>({ success: true, id: saved.id, reference, duplicate: false, ignoredFields }, { status: 201 });
  } catch (error) {
    // logError never prints bound query parameters (which would hold the submission).
    logError("Public Intake", error);
    return fail("Internal server error.", 500);
  }
}
