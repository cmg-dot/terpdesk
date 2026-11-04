import { randomUUID } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { offers, requests, timesheets } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { notifyAgencyAdmins } from "@/lib/notifications";
import { logError } from "@/lib/logError";
import { missingVerificationFields, parseServiceVerification, reportsNoService } from "@/lib/odhhVerificationParser";
import type { ParsedServiceVerification, VerificationHints } from "@/lib/odhhVerificationParser";
import type { DbTx } from "@/lib/positionClaim";
import { logActivity } from "@/lib/requestActivity";
import { removeObjectsQuietly } from "@/lib/s3";
import { recordStateJobHours } from "@/lib/stateJobHours";
import { pickSignature, signatureUrlFor, storeSignature } from "@/lib/verificationSignature";
import type { StoredSignature } from "@/lib/verificationSignature";
import { verificationNote } from "@/lib/verificationPending";
import type { PendingVerification } from "@/lib/verificationPending";
import { appendPendingVerification, reportIdFor, resolveBookedInterpreter } from "@/lib/verificationPendingStore";
import { isStateJobRequest } from "@/lib/stateJob";
import { getIanaZone, resolveRequestTimes, wallClockToUtc } from "@/utils/timezone";

/**
 * Applies an ODHH "SERVICE VERIFICATION" email (the state's receipt, which acts as the timesheet) to the existing
 * request with the same SRN. It never creates a request: a receipt with no matching request is reported, not turned
 * into a draft.
 *
 * Which interpreter is it for? One booked: that person. Two booked (a team job): the one whose name the report gives.
 * Nobody booked, or no name that fits: the report is parked on the job as a pending verification (signature already
 * stored) and staff pick the interpreter in Hours review (see verificationAssignment.ts).
 *
 * Every query is parameterized. Database errors are not caught here: the intake route reports them through logError
 * (no bound values), and nothing here logs names, SRNs, times or fees: only outcomes and counts.
 *
 * SERVER ONLY.
 */

export type VerificationOutcome =
  | "pending_review" // saved as a submitted timesheet: waiting under Hours review > "Awaiting review"
  | "needs_interpreter" // kept on the job; staff choose the interpreter in Hours review > "Needs an interpreter"
  | "unchanged" // already recorded with these same values
  | "conflict" // already recorded with different values: left as is, staff notified
  | "no_matching_request"
  | "ambiguous_srn" // more than one open request has this SRN
  | "not_state_job";

export type ServiceVerificationResult =
  | { ok: true; outcome: VerificationOutcome; requestId?: string }
  | { ok: false; error: string; missingFields?: string[] };

/**
 * Everything the pipeline touches outside the request itself, in one place: a test or a replay passes an open transaction
 * and silent stand-ins, so a rehearsal can run the real code and roll it all back with nothing leaked.
 */
export interface VerificationEffects {
  exec: DbTx;
  storeSignature: typeof storeSignature;
  removeObjects: (keys: string[]) => Promise<void>;
  notify: (title: string, message: string, requestId?: string, href?: string) => Promise<void>;
  audit: (entry: { action: string; details: string }) => Promise<void>;
  activity: typeof logActivity;
  refresh: (requestId: string) => void;
}

/** What the staff see when a receipt could not be applied automatically. Never includes names or times. */
async function flagForStaff(title: string, message: string, requestId?: string, href?: string): Promise<void> {
  await notifyAgencyAdmins({ type: "job", href: href ?? (requestId ? `/requests/${requestId}` : "/requests"), title, message });
}

export const liveEffects = (): VerificationEffects => ({
  exec: db as unknown as DbTx,
  storeSignature,
  removeObjects: removeObjectsQuietly,
  notify: flagForStaff,
  audit: writeAuditLog,
  activity: logActivity,
  refresh: (requestId) => {
    for (const path of ["/hours-review", "/dashboard", "/requests", `/requests/${requestId}`, "/jobs"]) revalidatePath(path);
  },
});

interface LooseData {
  details?: { timeZone?: string; timezone?: string };
  timeZone?: string;
  timezone?: string;
}

const MAX_SHIFT_HOURS = 24;
const FUTURE_TOLERANCE_MS = 10 * 60_000;

function computeTimes(parsed: ParsedServiceVerification, appointmentStartsAt: string, zone: string): { start: Date; end: Date } | string {
  const appointmentDate = formatInTimeZone(new Date(appointmentStartsAt), zone, "yyyy-MM-dd");
  const startDate = parsed.startDate ?? appointmentDate;
  const endDate = parsed.endDate ?? startDate;
  const start = new Date(wallClockToUtc(`${startDate}T${parsed.startTime}:00`, zone));
  const end = new Date(wallClockToUtc(`${endDate}T${parsed.endTime}:00`, zone));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "The actual start or end time could not be understood.";
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  if (!(hours > 0)) return "The actual end time must be after the actual start time.";
  if (hours > MAX_SHIFT_HOURS) return "The actual service time cannot be longer than 24 hours.";
  if (end.getTime() > Date.now() + FUTURE_TOLERANCE_MS) return "The actual end time is in the future.";
  return { start, end };
}

/** What the intake webhook answers for a service verification (the Lambda reads `outcome`). */
export type TimesheetIntakeResponse =
  | { success: true; type: "timesheet"; outcome: VerificationOutcome; id?: string }
  | { success: false; error: string; missingFields?: string[] };

/** The webhook's HTTP answer for a service verification. 422 = the email will never parse, so the Lambda must not retry it. */
export async function respondToServiceVerification(rawContent: string, hintsRaw: unknown, attachmentsRaw?: unknown): Promise<NextResponse<TimesheetIntakeResponse>> {
  // HIPAA: only the size and the outcome are logged, never the email or any value read from it.
  console.log("[Intake Webhook] Service verification received", { contentLength: rawContent.length, attachments: Array.isArray(attachmentsRaw) ? attachmentsRaw.length : 0 });
  const hints = hintsRaw && typeof hintsRaw === "object" && !Array.isArray(hintsRaw) ? (hintsRaw as VerificationHints) : undefined;
  const result = await processServiceVerification(rawContent, hints, attachmentsRaw);
  if (!result.ok) return NextResponse.json({ success: false, error: result.error, missingFields: result.missingFields }, { status: 422 });
  console.log("[Intake Webhook] Service verification processed", { outcome: result.outcome });
  return NextResponse.json({ success: true, type: "timesheet", outcome: result.outcome, id: result.requestId }, { status: 200 });
}

export async function processServiceVerification(
  rawContent: string,
  hints?: VerificationHints,
  attachmentsRaw?: unknown,
  fx: VerificationEffects = liveEffects(),
): Promise<ServiceVerificationResult> {
  const { exec } = fx;
  const parsed = parseServiceVerification(rawContent, hints);
  const missing = missingVerificationFields(parsed);
  if (missing.length > 0) {
    return { ok: false, error: "Could not read the service verification (missing fields).", missingFields: missing };
  }
  const srn = parsed.srn as string;

  // The SRN lives in the request's JSON. The value is a bound parameter, never part of the SQL text.
  const matches = await exec
    .select({ id: requests.id, createdAt: requests.createdAt, data: requests.data, isStateJob: requests.isStateJob })
    .from(requests)
    .where(and(sql`${requests.data} #>> '{intake,odhhSrn}' = ${srn}`, isNull(requests.canceledAt)))
    .limit(3);

  if (matches.length === 0) {
    await fx.notify("Service verification without a request", "A service verification email arrived for an SRN with no open request. Check the SRN and add the request if needed.");
    await fx.audit({ action: "service_verification_received", details: "outcome=no_matching_request" });
    return { ok: true, outcome: "no_matching_request" };
  }
  if (matches.length > 1) {
    await fx.notify("Service verification needs review", "A service verification email matches more than one open request. Record its hours manually.");
    await fx.audit({ action: "service_verification_received", details: `outcome=ambiguous_srn; matches=${matches.length}` });
    return { ok: true, outcome: "ambiguous_srn" };
  }

  const request = matches[0];
  const requestId = request.id;
  if (!isStateJobRequest(request)) {
    await fx.audit({ action: "service_verification_received", details: `outcome=not_state_job; requestId=${requestId}` });
    return { ok: true, outcome: "not_state_job", requestId };
  }

  const data = (request.data ?? {}) as unknown as LooseData;
  const zone = getIanaZone(data.details?.timeZone ?? data.details?.timezone ?? data.timeZone ?? data.timezone);
  const { startsAt } = resolveRequestTimes({ createdAt: request.createdAt, data: request.data });
  // A receipt that reports no service (cancelled / not completed) may carry no times at all; it is still recorded.
  const computed = parsed.startTime && parsed.endTime ? computeTimes(parsed, startsAt, zone) : null;
  if (typeof computed === "string" && !reportsNoService(parsed)) return { ok: false, error: computed };
  const times = computed !== null && typeof computed !== "string" ? computed : null;

  const serviceHours = times ? Math.round(((times.end.getTime() - times.start.getTime()) / 3_600_000) * 100) / 100 : 0;
  const totalMiles = parsed.totalMiles ?? 0;

  // Keep the receipt on the request (staff-only) whatever happens next, as a record and for manual follow-up.
  const record = {
    receivedAt: new Date().toISOString(),
    actualStart: times?.start.toISOString() ?? null,
    actualEnd: times?.end.toISOString() ?? null,
    totalMiles,
    otherFeesText: parsed.otherFeesText,
    otherFeesAmount: parsed.otherFeesAmount,
    serviceComplete: parsed.serviceComplete,
    cancellation: parsed.cancellation,
    cancelledBy: parsed.cancelledBy,
    comments: parsed.comments,
  };
  await exec.execute(sql`
    UPDATE requests
    SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{serviceVerification}', coalesce(data -> 'serviceVerification', '{}'::jsonb) || ${JSON.stringify(record)}::jsonb),
        updated_at = now()
    WHERE id = ${requestId}
  `);

  const booked = await exec
    .select({ interpreterId: offers.interpreterId })
    .from(offers)
    .where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted")));
  const resolution = await resolveBookedInterpreter(exec, Array.from(new Set(booked.map((b) => b.interpreterId))), parsed.interpreterName);

  // The signature (first real PDF / image attachment, never an inline logo) goes to the private bucket first. If the
  // storage is unavailable the hours are still recorded and staff are told the signature is missing.
  const signatureFile = pickSignature(attachmentsRaw);
  let stored: StoredSignature | null = null;
  if (signatureFile) {
    try {
      stored = await fx.storeSignature(requestId, signatureFile);
    } catch (err) {
      logError("Service verification signature upload", err);
    }
  }
  const signatureLost = Boolean(signatureFile) && !stored;

  if (resolution.kind === "pending") {
    // Kept on the job with its signature until staff choose the interpreter. A re-sent copy of the same email is not added twice.
    const entry: PendingVerification = {
      id: reportIdFor(rawContent),
      receivedAt: record.receivedAt,
      reason: resolution.reason,
      reportInterpreter: { id: parsed.interpreterId, name: parsed.interpreterName, credentials: parsed.interpreterCredentials },
      actualStart: record.actualStart,
      actualEnd: record.actualEnd,
      totalMiles,
      otherFeesText: parsed.otherFeesText,
      serviceComplete: parsed.serviceComplete,
      cancellation: parsed.cancellation,
      cancelledBy: parsed.cancelledBy,
      comments: parsed.comments,
      signature: stored,
    };
    const added = await appendPendingVerification(exec, requestId, entry);
    if (!added) {
      if (stored) await fx.removeObjects([stored.storageKey]);
      await fx.audit({ action: "service_verification_received", details: `outcome=unchanged; requestId=${requestId}; pending=duplicate` });
      return { ok: true, outcome: "unchanged", requestId };
    }
    await fx.notify(
      "ODHH hours need an interpreter",
      `A service verification was received that needs its interpreter confirmed. Open Hours review to assign it.${signatureLost ? " Its signature could not be saved; check the original email." : ""}`,
      requestId,
      "/hours-review",
    );
    await fx.audit({ action: "service_verification_received", details: `outcome=needs_interpreter; reason=${resolution.reason}; requestId=${requestId}; reportId=${entry.id}; signature=${stored ? "stored" : signatureLost ? "failed" : "none"}` });
    fx.refresh(requestId);
    return { ok: true, outcome: "needs_interpreter", requestId };
  }
  const interpreterId = resolution.interpreterId;

  const timesheetId = randomUUID();
  const created = await recordStateJobHours(
    {
      requestId,
      interpreterId,
      start: times?.start ?? null,
      end: times?.end ?? null,
      serviceHours,
      totalMiles,
      note: verificationNote(parsed),
      review: {
        timesheetId,
        serviceCompleted: parsed.serviceComplete,
        // Shown on the review card next to "Not completed": who cancelled, and what the state wrote.
        cancellationReason: reportsNoService(parsed) ? [parsed.cancellation, parsed.comments].filter(Boolean).join(" - ") || null : null,
        signature: stored ? { stored, url: signatureUrlFor(timesheetId) } : null,
      },
    },
    exec,
  );

  if (!created) {
    if (stored) await fx.removeObjects([stored.storageKey]); // a repeat of an email already recorded: no second copy
    // A timesheet already exists. The same figures are a no-op (a re-sent email); different figures are never
    // overwritten automatically, because the earlier ones may already be paid. Staff decide.
    const [existing] = await exec
      .select({ start: timesheets.actualStartTime, end: timesheets.actualEndTime, mileage: timesheets.mileage })
      .from(timesheets)
      .where(and(eq(timesheets.requestId, requestId), eq(timesheets.interpreterId, interpreterId)))
      .limit(1);
    const same =
      (existing?.start?.getTime() ?? null) === (times?.start.getTime() ?? null) &&
      (existing?.end?.getTime() ?? null) === (times?.end.getTime() ?? null) &&
      Number(existing?.mileage ?? 0) === Number(totalMiles.toFixed(1));
    if (!same) {
      await fx.notify("Service verification differs from recorded hours", "A new service verification has different hours or mileage than what is already recorded. Review the request.", requestId);
    }
    await fx.audit({ action: "service_verification_received", details: `outcome=${same ? "unchanged" : "conflict"}; requestId=${requestId}` });
    return { ok: true, outcome: same ? "unchanged" : "conflict", requestId };
  }

  await fx.activity({
    requestId,
    interpreterId,
    audience: "shared",
    kind: "hours_verified",
    message: "Hours received from the ODHH service verification (waiting for staff review)",
    actorLabel: "ODHH service verification",
  });
  // Generic wording only: no names, dates, comments or cancellation details in notifications (security.md).
  await fx.notify(
    "ODHH hours to review",
    `A service verification was received and is waiting in Hours review.${reportsNoService(parsed) ? " It reports the service was not completed or was cancelled." : ""}${signatureLost ? " Its signature could not be saved; check the original email." : ""}`,
    requestId,
    "/hours-review",
  );
  await fx.audit({
    action: "service_verification_received",
    details: `outcome=pending_review; requestId=${requestId}; timesheetId=${created.id}; serviceHours=${serviceHours.toFixed(2)}; signature=${stored ? "stored" : signatureLost ? "failed" : "none"}; matchedBy=${booked.length > 1 ? "report_name" : "only_booking"}`,
  });

  fx.refresh(requestId);
  return { ok: true, outcome: "pending_review", requestId };
}
