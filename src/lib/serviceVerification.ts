import { and, eq, isNull, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { offers, requests, timesheets } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { notifyAgencyAdmins } from "@/lib/notifications";
import { missingVerificationFields, parseServiceVerification } from "@/lib/odhhVerificationParser";
import type { ParsedServiceVerification, VerificationHints } from "@/lib/odhhVerificationParser";
import { logActivity } from "@/lib/requestActivity";
import { recordStateJobHours } from "@/lib/stateJobHours";
import { isStateJobRequest } from "@/lib/stateJob";
import { getIanaZone, resolveRequestTimes, wallClockToUtc } from "@/utils/timezone";

/**
 * Applies an ODHH "SERVICE VERIFICATION" email (the state's receipt, which acts as the timesheet) to the existing
 * request with the same SRN. It never creates a request: a receipt with no matching request is reported, not turned
 * into a draft.
 *
 * Every query is parameterized. Database errors are not caught here: the intake route reports them through logError
 * (no bound values), and nothing here logs names, SRNs, times or fees: only outcomes and counts.
 *
 * SERVER ONLY.
 */

export type VerificationOutcome =
  | "recorded" // hours written to a new approved timesheet
  | "unchanged" // already recorded with these same values
  | "conflict" // already recorded with different values: left as is, staff notified
  | "no_matching_request"
  | "ambiguous_srn" // more than one open request has this SRN
  | "no_booking" // nobody is booked on the request yet
  | "ambiguous_booking" // more than one interpreter is booked
  | "not_state_job";

export type ServiceVerificationResult =
  | { ok: true; outcome: VerificationOutcome; requestId?: string }
  | { ok: false; error: string; missingFields?: string[] };

interface LooseData {
  details?: { timeZone?: string; timezone?: string };
  timeZone?: string;
  timezone?: string;
}

const MAX_SHIFT_HOURS = 24;
const FUTURE_TOLERANCE_MS = 10 * 60_000;

/** What staff see when a receipt could not be applied automatically. Never includes names or times. */
async function flagForStaff(title: string, message: string, requestId?: string): Promise<void> {
  await notifyAgencyAdmins({ type: "job", href: requestId ? `/requests/${requestId}` : "/requests", title, message });
}

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
export async function respondToServiceVerification(rawContent: string, hintsRaw: unknown): Promise<NextResponse<TimesheetIntakeResponse>> {
  // HIPAA: only the size and the outcome are logged, never the email or any value read from it.
  console.log("[Intake Webhook] Service verification received", { contentLength: rawContent.length });
  const hints = hintsRaw && typeof hintsRaw === "object" && !Array.isArray(hintsRaw) ? (hintsRaw as VerificationHints) : undefined;
  const result = await processServiceVerification(rawContent, hints);
  if (!result.ok) return NextResponse.json({ success: false, error: result.error, missingFields: result.missingFields }, { status: 422 });
  console.log("[Intake Webhook] Service verification processed", { outcome: result.outcome });
  return NextResponse.json({ success: true, type: "timesheet", outcome: result.outcome, id: result.requestId }, { status: 200 });
}

export async function processServiceVerification(rawContent: string, hints?: VerificationHints): Promise<ServiceVerificationResult> {
  const parsed = parseServiceVerification(rawContent, hints);
  const missing = missingVerificationFields(parsed);
  if (missing.length > 0) {
    return { ok: false, error: "Could not read the service verification (missing fields).", missingFields: missing };
  }
  const srn = parsed.srn as string;

  // The SRN lives in the request's JSON. The value is a bound parameter, never part of the SQL text.
  const matches = await db
    .select({ id: requests.id, createdAt: requests.createdAt, data: requests.data, isStateJob: requests.isStateJob })
    .from(requests)
    .where(and(sql`${requests.data} #>> '{intake,odhhSrn}' = ${srn}`, isNull(requests.canceledAt)))
    .limit(3);

  if (matches.length === 0) {
    await flagForStaff("Service verification without a request", "A service verification email arrived for an SRN with no open request. Check the SRN and add the request if needed.");
    await writeAuditLog({ action: "service_verification_received", details: "outcome=no_matching_request" });
    return { ok: true, outcome: "no_matching_request" };
  }
  if (matches.length > 1) {
    await flagForStaff("Service verification needs review", "A service verification email matches more than one open request. Record its hours manually.");
    await writeAuditLog({ action: "service_verification_received", details: `outcome=ambiguous_srn; matches=${matches.length}` });
    return { ok: true, outcome: "ambiguous_srn" };
  }

  const request = matches[0];
  const requestId = request.id;
  if (!isStateJobRequest(request)) {
    await writeAuditLog({ action: "service_verification_received", details: `outcome=not_state_job; requestId=${requestId}` });
    return { ok: true, outcome: "not_state_job", requestId };
  }

  const data = (request.data ?? {}) as unknown as LooseData;
  const zone = getIanaZone(data.details?.timeZone ?? data.details?.timezone ?? data.timeZone ?? data.timezone);
  const { startsAt } = resolveRequestTimes({ createdAt: request.createdAt, data: request.data });
  const times = computeTimes(parsed, startsAt, zone);
  if (typeof times === "string") return { ok: false, error: times };

  const serviceHours = Math.round(((times.end.getTime() - times.start.getTime()) / 3_600_000) * 100) / 100;
  const totalMiles = parsed.totalMiles ?? 0;

  // Keep the receipt on the request (staff-only) whatever happens next, as a record and for manual follow-up.
  const record = {
    receivedAt: new Date().toISOString(),
    actualStart: times.start.toISOString(),
    actualEnd: times.end.toISOString(),
    totalMiles,
    otherFeesText: parsed.otherFeesText,
    otherFeesAmount: parsed.otherFeesAmount,
  };
  await db.execute(sql`
    UPDATE requests
    SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{serviceVerification}', ${JSON.stringify(record)}::jsonb),
        updated_at = now()
    WHERE id = ${requestId}
  `);

  const booked = await db
    .select({ interpreterId: offers.interpreterId })
    .from(offers)
    .where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted")));
  const interpreterIds = Array.from(new Set(booked.map((b) => b.interpreterId)));
  if (interpreterIds.length !== 1) {
    const outcome: VerificationOutcome = interpreterIds.length === 0 ? "no_booking" : "ambiguous_booking";
    await flagForStaff(
      "Service verification needs review",
      interpreterIds.length === 0 ? "A service verification arrived for a request with no booked interpreter." : "A service verification arrived for a request with more than one booked interpreter.",
      requestId,
    );
    await writeAuditLog({ action: "service_verification_received", details: `outcome=${outcome}; requestId=${requestId}` });
    return { ok: true, outcome, requestId };
  }
  const interpreterId = interpreterIds[0];

  const feesNote = parsed.otherFeesText ? ` Other fee(s): ${parsed.otherFeesText}` : "";
  const created = await recordStateJobHours({
    requestId,
    interpreterId,
    start: times.start,
    end: times.end,
    serviceHours,
    totalMiles,
    note: `Recorded from the ODHH service verification.${feesNote}`,
  });

  if (!created) {
    // A timesheet already exists. The same figures are a no-op (a re-sent email); different figures are never
    // overwritten automatically, because the earlier ones may already be paid. Staff decide.
    const [existing] = await db
      .select({ start: timesheets.actualStartTime, end: timesheets.actualEndTime, mileage: timesheets.mileage })
      .from(timesheets)
      .where(and(eq(timesheets.requestId, requestId), eq(timesheets.interpreterId, interpreterId)))
      .limit(1);
    const same =
      existing?.start?.getTime() === times.start.getTime() &&
      existing?.end?.getTime() === times.end.getTime() &&
      Number(existing?.mileage ?? 0) === Number(totalMiles.toFixed(1));
    if (!same) {
      await flagForStaff("Service verification differs from recorded hours", "A new service verification has different hours or mileage than what is already recorded. Review the request.", requestId);
    }
    await writeAuditLog({ action: "service_verification_received", details: `outcome=${same ? "unchanged" : "conflict"}; requestId=${requestId}` });
    return { ok: true, outcome: same ? "unchanged" : "conflict", requestId };
  }

  await logActivity({
    requestId,
    interpreterId,
    audience: "shared",
    kind: "hours_verified",
    message: "Hours recorded from the ODHH service verification",
    actorLabel: "ODHH service verification",
  });
  await flagForStaff("Hours recorded from ODHH", "A service verification was applied and the hours were recorded as approved.", requestId);
  await writeAuditLog({
    action: "service_verification_received",
    details: `outcome=recorded; requestId=${requestId}; timesheetId=${created.id}; serviceHours=${serviceHours.toFixed(2)}`,
  });

  revalidatePath("/hours-review");
  revalidatePath("/dashboard");
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/jobs");
  return { ok: true, outcome: "recorded", requestId };
}
