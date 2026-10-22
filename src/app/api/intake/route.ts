export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { logActivity } from "@/lib/requestActivity";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { db } from "@/db";
import { requests, type RequestData } from "@/db/schema";
import {
  FORMAT_LABELS,
  ODHH_PROGRAM,
  ODHH_TIME_ZONE_IANA,
  ODHH_TIME_ZONE_LABEL,
  parseIntakeEmail,
  type AppointmentFormat,
} from "@/lib/odhhEmailParser";

/**
 * Webhook receiver for the AWS Lambda email forwarder.
 * Lambda POSTs each inbound domain email as JSON: { email, subject, rawContent }.
 */
interface InboundEmailPayload {
  email: string;
  subject: string;
  rawContent: string;
}

interface WebhookSuccessResponse {
  success: true;
  id: string;
  received: { email: string; subject: string; contentLength: number };
  /** Non-PII parse summary so Lambda/CloudWatch can confirm extraction quality. */
  parsed: {
    srn: string | null;
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    venue: string | null;
    format: AppointmentFormat | null;
    hasClientName: boolean;
    hasPurpose: boolean;
    hasMeeting: boolean;
    hasNote: boolean;
    hasClientGender: boolean;
  };
  warnings: string[];
}

interface WebhookErrorResponse {
  success: false;
  error: string;
  invalidFields?: (keyof InboundEmailPayload)[];
}

const REQUIRED_FIELDS: readonly (keyof InboundEmailPayload)[] = ["email", "subject", "rawContent"];

/**
 * Constant-time comparison. Both values are SHA-256 hashed first so the buffers
 * are always equal length (timingSafeEqual throws otherwise) and length isn't leaked.
 */
function isValidApiKey(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function validatePayload(
  body: unknown
): { ok: true; data: InboundEmailPayload } | { ok: false; invalidFields: (keyof InboundEmailPayload)[] } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, invalidFields: [...REQUIRED_FIELDS] };
  }

  const record = body as Record<string, unknown>;
  const invalidFields = REQUIRED_FIELDS.filter((field) => typeof record[field] !== "string");

  if (invalidFields.length > 0) {
    return { ok: false, invalidFields };
  }

  return {
    ok: true,
    data: {
      email: record.email as string,
      subject: record.subject as string,
      rawContent: record.rawContent as string,
    },
  };
}

export async function POST(
  req: Request
): Promise<NextResponse<WebhookSuccessResponse | WebhookErrorResponse>> {
  try {
    const expectedSecret = process.env.INTAKE_WEBHOOK_SECRET;
    if (!expectedSecret) {
      // Fail closed: never accept traffic when the secret isn't configured.
      console.error("[Intake Webhook] INTAKE_WEBHOOK_SECRET is not set — rejecting request.");
      return NextResponse.json({ success: false, error: "Webhook is not configured." }, { status: 500 });
    }

    if (!isValidApiKey(req.headers.get("x-api-key"), expectedSecret)) {
      console.warn("[Intake Webhook] Unauthorized request (missing or invalid x-api-key).");
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      // Malformed JSON will never succeed on retry — reject as a client error.
      return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
    }

    const validation = validatePayload(body);
    if (!validation.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Payload must include string fields: email, subject, rawContent.",
          invalidFields: validation.invalidFields,
        },
        { status: 400 }
      );
    }

    const { email, subject, rawContent } = validation.data;

    // Verification log for the live AWS trigger. rawContent is intentionally not logged (may contain PII).
    console.log("[Intake Webhook] Inbound email received", {
      email,
      subject,
      contentLength: rawContent.length,
      receivedAt: new Date().toISOString(),
    });

    const receivedAt = new Date().toISOString();
    const parsed = parseIntakeEmail(rawContent, subject);
    const warnings: string[] = [];

    if (!parsed.srn) warnings.push("SRN not found or failed sanitisation");
    if (!parsed.date) warnings.push("Appointment date not found");
    else if (!parsed.isoDate) warnings.push("Appointment date malformed");
    if (!parsed.startTime) warnings.push("Start time not found");
    else if (!parsed.start24) warnings.push("Start time malformed");
    if (parsed.endTime && !parsed.end24) warnings.push("End time malformed");
    if (!parsed.venue && !parsed.address) warnings.push("Location not found");
    if (!parsed.format) warnings.push("Format not found");
    else if (parsed.formatInferred) warnings.push("Format inferred as in_person from address");
    if (!parsed.clientName) warnings.push("Client name not found");
    if (!parsed.purpose) warnings.push("Purpose not found");
    if ((parsed.format === "virtual" || parsed.format === "hybrid") && !parsed.platform && !parsed.meetingLink) {
      warnings.push("Virtual meeting platform/link not found");
    }

    // Build UTC timestamps from Pacific wall-clock time.
    let startsAt: Date | null = null;
    let endsAt: Date | null = null;
    if (parsed.isoDate && parsed.start24) {
      startsAt = fromZonedTime(`${parsed.isoDate}T${parsed.start24}:00`, ODHH_TIME_ZONE_IANA);
      if (Number.isNaN(startsAt.getTime())) {
        startsAt = null;
        warnings.push("Could not compute start timestamp");
      }
    }
    if (startsAt) {
      if (parsed.end24) {
        endsAt = fromZonedTime(`${parsed.isoDate}T${parsed.end24}:00`, ODHH_TIME_ZONE_IANA);
      }
      if (!endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        if (parsed.end24) warnings.push("End time not after start; defaulted to 1 hour");
        endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      }
    }

    const locationLabel = parsed.venue ?? parsed.address ?? "TBD";
    const title = parsed.srn
      ? `ODHH SRN #${parsed.srn}${parsed.venue ? ` — ${parsed.venue}` : ""}`
      : subject.trim().slice(0, 200) || `Inbound email from ${email}`;

    const requestData: RequestData = {
      brief: {},
      intake: {
        program: ODHH_PROGRAM,
        ...(parsed.srn ? { odhhSrn: parsed.srn } : {}),
      },
      details: {
        timeZone: ODHH_TIME_ZONE_LABEL,
        ...(parsed.format ? { format: FORMAT_LABELS[parsed.format], formatCode: parsed.format } : {}),
        ...(parsed.clientName ? { deafParticipant: parsed.clientName } : {}),
        ...(parsed.purpose ? { purpose: parsed.purpose } : {}),
        ...(parsed.platform ? { platform: parsed.platform } : {}),
        ...(parsed.meetingLink ? { meetingLink: parsed.meetingLink, virtualLink: parsed.meetingLink } : {}),
        // Staff-only: stored with the draft, never logged or put in an email.
        ...(parsed.clientGender ? { clientGender: parsed.clientGender } : {}),
      },
      // The ODHH "Appointment Note" lands in the agency's Preparation notes field, so staff review it before booking.
      ...(parsed.appointmentNote ? { prepNotes: parsed.appointmentNote } : {}),
      onsite: {
        venue: parsed.venue ?? "",
        address: parsed.address ?? "",
      },
      overview: { location: locationLabel, status: "Unfilled / draft" },
      requester: { email, org: "WA ODHH" },
      schedule: {
        date: parsed.date,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        startsAt: startsAt ? startsAt.toISOString() : null,
        endsAt: endsAt ? endsAt.toISOString() : null,
      },
      source: {
        channel: "aws_lambda_email",
        fromEmail: email,
        subject,
        rawContent,
        receivedAt,
        parseWarnings: warnings,
      },
    };

    // Runs inside the outer try: any connection/constraint failure falls through to the 500 handler.
    const [inserted] = await db
      .insert(requests)
      .values({
        title,
        status: "draft",
        // This parser only handles ODHH emails (program is always WA ODHH), so these are always state jobs.
        isStateJob: true,
        data: requestData,
        // The app reads createdAt as the appointment start (see createRequest); default now() if unparsed.
        ...(startsAt ? { createdAt: startsAt } : {}),
      })
      .returning({ id: requests.id });

    await logActivity({ requestId: inserted.id, kind: "created", audience: "shared", message: "Request created", actorLabel: "Email intake" });

    revalidatePath("/requests");
    revalidatePath("/dashboard");
    revalidatePath("/calendar");

    console.log("[Intake Webhook] Draft request created", {
      id: inserted.id,
      srn: parsed.srn,
      warnings,
    });

    return NextResponse.json(
      {
        success: true,
        id: inserted.id,
        received: { email, subject, contentLength: rawContent.length },
        parsed: {
          srn: parsed.srn,
          date: parsed.date,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          venue: parsed.venue,
          format: parsed.format,
          hasClientName: parsed.clientName !== null,
          hasPurpose: parsed.purpose !== null,
          hasMeeting: parsed.platform !== null || parsed.meetingLink !== null,
          hasNote: parsed.appointmentNote !== null,
          hasClientGender: parsed.clientGender !== null,
        },
        warnings,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Intake Webhook] Failed to process inbound email:", error);
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}
