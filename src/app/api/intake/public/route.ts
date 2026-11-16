export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { rejectUnlessIntakeAuthorized } from "@/lib/intakeAuth";
import { logError } from "@/lib/logError";
import { buildPublicRequest, parsePublicIntake } from "@/lib/publicIntake";
import type { FieldProblem } from "@/lib/publicIntake";
import { announcePublicRequest, insertPublicRequest } from "@/lib/publicIntakeSave";
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

type PublicIntakeResponse =
  | { success: true; id: string; reference: string; duplicate: boolean; ignoredFields?: string[] }
  | { success: false; error: string; fields?: FieldProblem[] };

const fail = (error: string, status: number, fields?: FieldProblem[]) =>
  NextResponse.json<PublicIntakeResponse>({ success: false, error, ...(fields ? { fields } : {}) }, { status });

/**
 * The payload's SHAPE for the logs: each field's name, type and length, never its value. Enough to spot a missing
 * field, a wrong type or an oversized value without writing a client's name, contact details or medical purpose to the
 * log (HIPAA, security.md).
 */
function describePayload(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return Array.isArray(body) ? "array" : typeof body;
  return Object.entries(body)
    .map(([key, v]) => `${key}:${typeof v === "string" ? `string(${v.length})` : v === null ? "null" : typeof v}`)
    .join(", ");
}

export async function POST(req: Request): Promise<NextResponse<PublicIntakeResponse | { success: false; error: string }>> {
  let stage = "auth";
  let body: unknown;
  try {
    const denied = rejectUnlessIntakeAuthorized(req, "Public Intake", "INTAKE_API_KEY");
    if (denied) return denied;

    stage = "read body";
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return fail("Request body is too large.", 413);
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return fail("Request body is too large.", 413);

    try {
      body = JSON.parse(raw);
    } catch {
      console.warn("[Public Intake] 400: body is not valid JSON", { bytes: raw.length });
      return fail("Request body must be valid JSON.", 400);
    }

    stage = "validate";
    const parsed = parsePublicIntake(body);
    if (!parsed.ok) {
      // Field names and our own messages only: the messages never repeat a submitted value.
      console.warn("[Public Intake] 422: rejected fields", { fields: parsed.fields, payload: describePayload(body) });
      return fail("Some fields are missing or not valid.", 422, parsed.fields);
    }

    stage = "build draft";
    const draft = buildPublicRequest(parsed.data);
    const submissionId = parsed.data.submissionId;

    stage = "insert draft";
    const saved = await insertPublicRequest(draft, submissionId);

    const reference = formatReference(saved.id);
    const ignoredFields = parsed.ignoredFields.length > 0 ? parsed.ignoredFields : undefined;
    if (saved.duplicate) {
      return NextResponse.json<PublicIntakeResponse>({ success: true, id: saved.id, reference, duplicate: true, ignoredFields }, { status: 200 });
    }

    stage = "after insert";
    await announcePublicRequest(saved.id, draft, "Public intake form");

    // HIPAA: the id only. No names, dates, locations or notes.
    console.log("[Public Intake] Draft request created", { id: saved.id });
    return NextResponse.json<PublicIntakeResponse>({ success: true, id: saved.id, reference, duplicate: false, ignoredFields }, { status: 201 });
  } catch (error) {
    // Message, stack and the Postgres error code. logError never prints bound query parameters (which would hold the
    // submission), and the payload is logged by shape only.
    console.error(`[Public Intake] 500 during "${stage}"`, { payload: describePayload(body) });
    logError("Public Intake", error);
    return fail("Internal server error.", 500);
  }
}
