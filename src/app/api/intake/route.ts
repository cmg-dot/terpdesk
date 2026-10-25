export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { rejectUnlessIntakeAuthorized } from "@/lib/intakeAuth";
import { logActivity } from "@/lib/requestActivity";
import { logError } from "@/lib/logError";
import { contentFingerprint, insertOdhhRequestOnce } from "@/lib/odhhDedupe";
import { respondToServiceVerification } from "@/lib/serviceVerification";
import type { TimesheetIntakeResponse } from "@/lib/serviceVerification";
import { resolveIntakeType } from "@/lib/odhhVerificationParser";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { db } from "@/db";
import type { RequestData } from "@/db/schema";
import {
  FORMAT_LABELS,
  ODHH_PROGRAM,
  ODHH_TIME_ZONE_IANA,
  ODHH_TIME_ZONE_LABEL,
  appointmentTimes,
  parseIntakeEmail,
  parseWarnings,
  sanitizeSrn,
  type AppointmentFormat,
} from "@/lib/odhhEmailParser";

/** Only the appointment note goes into the interpreter-visible preparation notes (the parser already caps it). */
const MAX_PREP_NOTES_LENGTH = 1000;

/**
 * Webhook receiver for the AWS Lambda email forwarder.
 * Lambda POSTs each inbound domain email as JSON: { email, subject, rawContent, type?, verification? }.
 *  - type "job_offer" (default): parsed into a new draft request.
 *  - type "timesheet": an ODHH SERVICE VERIFICATION. It updates the existing request with the same SRN and never
 *    creates a draft (see lib/serviceVerification.ts). When `type` is missing it is inferred from the email text.
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
    hasRequestor: boolean;
    hasClientInfoBlock: boolean;
  };
  warnings: string[];
}

/** A repeat of an email whose job is already saved: nothing was inserted. */
interface DuplicateIntakeResponse {
  success: true;
  duplicate: true;
  outcome: "duplicate";
  id: string;
}

interface WebhookErrorResponse {
  success: false;
  error: string;
  invalidFields?: (keyof InboundEmailPayload)[];
  /** Service verification: the required fields that could not be read. */
  missingFields?: string[];
}

const REQUIRED_FIELDS: readonly (keyof InboundEmailPayload)[] = ["email", "subject", "rawContent"];

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
): Promise<NextResponse<WebhookSuccessResponse | DuplicateIntakeResponse | TimesheetIntakeResponse | WebhookErrorResponse>> {
  try {
    const denied = rejectUnlessIntakeAuthorized(req, "Intake Webhook");
    if (denied) return denied;

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

    const declaredType = (body as Record<string, unknown>).type;
    if (declaredType !== undefined && declaredType !== "job_offer" && declaredType !== "timesheet") {
      return NextResponse.json({ success: false, error: 'type must be "job_offer" or "timesheet".' }, { status: 400 });
    }
    const intakeType = resolveIntakeType(declaredType, rawContent);

    if (intakeType === "timesheet") return respondToServiceVerification(rawContent, (body as Record<string, unknown>).verification);

    // HIPAA: log only that an email arrived and its size. The sender, subject and body can hold PHI, so none are logged.
    console.log("[Intake Webhook] Inbound email received", { contentLength: rawContent.length });

    const receivedAt = new Date().toISOString();
    const parsed = parseIntakeEmail(rawContent, subject);
    // The SRN that identifies this job: read from the email, else the Lambda's own extraction if it sent one.
    const verificationHint = (body as Record<string, unknown>).verification;
    const hintedSrn =
      verificationHint && typeof verificationHint === "object" && !Array.isArray(verificationHint)
        ? sanitizeSrn(String((verificationHint as { srn?: unknown }).srn ?? "").trim() || undefined)
        : null;
    const srn = parsed.srn ?? hintedSrn;
    const contentHash = contentFingerprint(rawContent);
    const warnings = parseWarnings(parsed);

    // Appointment start/end in UTC from the email's Pacific wall-clock times.
    const { startsAt, endsAt } = appointmentTimes(parsed, warnings);

    const locationLabel = parsed.venue ?? parsed.address ?? "TBD";
    const hasRequestor = Boolean(parsed.requestorName || parsed.requestorPhone || parsed.requestorEmail);
    // A "Comment:" line inside the client/employee section stays in that (private) block and is not copied into the
    // interpreter-visible preparation notes.
    const noteAlreadyInBlock = Boolean(parsed.appointmentNote && parsed.clientInfoBlock?.includes(parsed.appointmentNote));
    const prepNotes = noteAlreadyInBlock ? "" : (parsed.appointmentNote ?? "").slice(0, MAX_PREP_NOTES_LENGTH);
    const title = srn
      ? `ODHH SRN #${srn}${parsed.venue ? ` — ${parsed.venue}` : ""}`
      : subject.trim().slice(0, 200) || `Inbound email from ${email}`;

    const requestData: RequestData = {
      brief: {},
      intake: {
        program: ODHH_PROGRAM,
        ...(srn ? { odhhSrn: srn } : {}),
      },
      details: {
        timeZone: ODHH_TIME_ZONE_LABEL,
        ...(parsed.format ? { format: FORMAT_LABELS[parsed.format], formatCode: parsed.format } : {}),
        ...(parsed.clientName ? { deafParticipant: parsed.clientName } : {}),
        ...(parsed.purpose ? { purpose: parsed.purpose } : {}),
        ...(parsed.platform ? { platform: parsed.platform } : {}),
        ...(parsed.meetingLink ? { meetingLink: parsed.meetingLink, virtualLink: parsed.meetingLink } : {}),
      },
      // The ODHH "Appointment Note" lands in the agency's Preparation notes field, so staff review it before booking.
      // Preparation notes are shared with booked interpreters, so they hold ONLY the appointment note from the email.
      ...(prepNotes ? { prepNotes } : {}),
      // The whole CLIENT/EMPLOYEE INFORMATION section (gender, hearing identity, comments, ...) is sensitive: it goes
      // to "Agency-private notes" (requests.data.privateNotes), which interpreters never receive.
      ...(parsed.clientInfoBlock ? { privateNotes: parsed.clientInfoBlock } : {}),
      onsite: {
        venue: parsed.venue ?? "",
        address: parsed.address ?? "",
      },
      overview: { location: locationLabel, status: "Unfilled / draft" },
      // One-time requester for this job: the ODHH requestor from the email. `oneTime` stops the edit page from
      // swapping in a saved client's default contact (it matches saved clients by organisation name).
      // Only if the email names no requestor at all is the forwarding address kept as the contact.
      requester: {
        org: "WA ODHH",
        oneTime: true,
        ...(hasRequestor
          ? {
              ...(parsed.requestorName ? { name: parsed.requestorName } : {}),
              ...(parsed.requestorPhone ? { phone: parsed.requestorPhone } : {}),
              ...(parsed.requestorEmail ? { email: parsed.requestorEmail } : {}),
            }
          : { email }),
      },
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
        // Fingerprint of the email text (not the text): lets a repeat of an email with no readable SRN be recognised.
        contentHash,
        receivedAt,
        parseWarnings: warnings,
      },
    };

    // Saved at most once per SRN: AWS retries and repeat emails must not create a second job. Runs inside the outer
    // try: any connection/constraint failure falls through to the 500 handler.
    const inserted = await insertOdhhRequestOnce(
      {
        title,
        status: "draft",
        // This parser only handles ODHH emails (program is always WA ODHH), so these are always state jobs.
        isStateJob: true,
        data: requestData,
        // The app reads createdAt as the appointment start (see createRequest); default now() if unparsed.
        ...(startsAt ? { createdAt: startsAt } : {}),
      },
      { srn, contentHash },
    );

    if (inserted.duplicate) {
      // 200 on purpose: the job is already saved, and a non-2xx would make AWS retry the delivery again.
      await logActivity({ requestId: inserted.id, kind: "duplicate_email_ignored", audience: "agency", message: "A repeat of this request's email was received and ignored", actorLabel: "Email intake" });
      console.log("[Intake Webhook] Duplicate email ignored", { id: inserted.id });
      return NextResponse.json({ success: true, duplicate: true, outcome: "duplicate", id: inserted.id }, { status: 200 });
    }

    await logActivity({ requestId: inserted.id, kind: "created", audience: "shared", message: "Request created", actorLabel: "Email intake" });

    revalidatePath("/requests");
    revalidatePath("/dashboard");
    revalidatePath("/calendar");

    // HIPAA: the request id and the parser's fixed warning labels only. No SRN, names, dates or other parsed values.
    console.log("[Intake Webhook] Draft request created", { id: inserted.id, warnings });

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
          hasRequestor,
          hasClientInfoBlock: parsed.clientInfoBlock !== null,
        },
        warnings,
      },
      { status: 200 }
    );
  } catch (error) {
    // logError never prints bound query parameters (which would hold the whole email).
    logError("Intake Webhook", error);
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}
