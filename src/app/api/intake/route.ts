export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { rejectUnlessIntakeAuthorized } from "@/lib/intakeAuth";
import { logError } from "@/lib/logError";
import { respondToServiceVerification } from "@/lib/serviceVerification";
import type { TimesheetIntakeResponse } from "@/lib/serviceVerification";
import { resolveIntakeType } from "@/lib/odhhVerificationParser";
import { processJobOfferEmail } from "@/lib/odhhIntakeProcess";
import { sanitizeSrn, type AppointmentFormat } from "@/lib/odhhEmailParser";

/**
 * Webhook receiver for the AWS Lambda email forwarder.
 * Lambda POSTs each inbound domain email as JSON: { email, subject, rawContent, type?, verification? }.
 *  - type "job_offer" (default): a new draft request, or the blanks of the job that already has the SRN filled in
 *    (see lib/odhhIntakeProcess.ts, which the Inbox uses too).
 *  - type "timesheet": an ODHH SERVICE VERIFICATION. It updates the existing request with the same SRN and never
 *    creates a draft (see lib/serviceVerification.ts). When `type` is missing it is inferred from the email text.
 *    `attachments` (base64 PDF / image files) may come with it: the first real, non-inline one is the state's signature.
 *    The hours land under Hours review > "Awaiting review" for staff to approve.
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

/** The email has no appointment anchor or no readable date/times (e.g. a conversational reply): no job was created. */
interface NotAJobResponse {
  success: true;
  outcome: "not_a_job";
  /** Fixed warning labels only, never text from the email. */
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
): Promise<NextResponse<WebhookSuccessResponse | NotAJobResponse | DuplicateIntakeResponse | TimesheetIntakeResponse | WebhookErrorResponse>> {
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

    if (intakeType === "timesheet") {
      const { verification, attachments } = body as Record<string, unknown>;
      return respondToServiceVerification(rawContent, verification, attachments);
    }

    // HIPAA: log only that an email arrived and its size. The sender, subject and body can hold PHI, so none are logged.
    console.log("[Intake Webhook] Inbound email received", { contentLength: rawContent.length });

    // The SRN the Lambda extracted itself, used only when the email text has none.
    const verificationHint = (body as Record<string, unknown>).verification;
    const hintedSrn =
      verificationHint && typeof verificationHint === "object" && !Array.isArray(verificationHint)
        ? sanitizeSrn(String((verificationHint as { srn?: unknown }).srn ?? "").trim() || undefined)
        : null;

    const result = await processJobOfferEmail({ email, subject, rawContent, hintedSrn });

    if (result.outcome === "not_a_job") {
      // 200 on purpose: a non-2xx would make AWS retry an email that will never become a job. Labels only in the log.
      console.log("[Intake Webhook] No job created", { contentLength: rawContent.length, warnings: result.warnings });
      return NextResponse.json({ success: true, outcome: "not_a_job", warnings: result.warnings }, { status: 200 });
    }

    if (result.outcome === "duplicate") {
      // 200 on purpose: the job is already saved, and a non-2xx would make AWS retry the delivery again.
      console.log(
        result.filled.length > 0 ? "[Intake Webhook] Existing request filled from the form" : "[Intake Webhook] Duplicate email ignored",
        { id: result.id, fields: result.filled.length },
      );
      return NextResponse.json({ success: true, duplicate: true, outcome: "duplicate", id: result.id }, { status: 200 });
    }

    const { parsed, warnings, hasRequestor } = result;
    // HIPAA: the request id and the parser's fixed warning labels only. No SRN, names, dates or other parsed values.
    console.log("[Intake Webhook] Draft request created", { id: result.id, warnings });

    return NextResponse.json(
      {
        success: true,
        id: result.id,
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
