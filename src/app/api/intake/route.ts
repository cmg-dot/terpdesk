import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { db } from "@/db";
import { requests, type Program, type RequestData } from "@/db/schema";

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

// ---------------------------------------------------------------------------
// ODHH email parsing
// ---------------------------------------------------------------------------

// Must match the schema's Program union (frontend checks program === 'WA ODHH').
const ODHH_PROGRAM: Program = "WA ODHH";
// ODHH is a Washington State agency — appointment times are Pacific.
const ODHH_TIME_ZONE_IANA = "America/Los_Angeles";
const ODHH_TIME_ZONE_LABEL = "Pacific Time — Seattle, Los Angeles";
const SRN_ALLOWED = /^[A-Za-z0-9-]{0,40}$/;
const MAX_FIELD_LENGTH = 300;

type AppointmentFormat = "in_person" | "virtual" | "hybrid";

// Labels must match the frontend's modality options exactly.
const FORMAT_LABELS: Record<AppointmentFormat, string> = {
  in_person: "In person",
  virtual: "Virtual",
  hybrid: "Hybrid — in person and virtual",
};

interface ParsedIntakeEmail {
  srn: string | null;
  date: string | null; // as written, e.g. 12/15/2021
  isoDate: string | null; // 2021-12-15
  startTime: string | null; // as written, e.g. 8:00 AM
  endTime: string | null;
  start24: string | null; // 08:00
  end24: string | null;
  venue: string | null;
  address: string | null;
  format: AppointmentFormat | null;
  formatInferred: boolean;
  clientName: string | null;
  purpose: string | null;
}

const TIME_FRAGMENT = String.raw`\d{1,2}(?::\d{2})?\s*[AaPp]\.?\s*[Mm]\.?`;

const SRN_PATTERNS: readonly RegExp[] = [
  /Service\s+Request\s*(?:#|No\.?|Number)\s*:?\s*#?\s*([A-Za-z0-9-]+)/i,
  /\bSRN\s*[:#]?\s*#?\s*([A-Za-z0-9-]+)/i,
];
const DATE_PATTERN = /^[ \t]*(?:Appointment[ \t]+|Service[ \t]+)?Date[ \t]*:[ \t]*(\d{1,2}\/\d{1,2}\/\d{2,4})/im;
const START_TIME_PATTERN = new RegExp(
  String.raw`^[ \t]*(?:Appointment[ \t]+)?Start[ \t]+Time[ \t]*:[ \t]*(${TIME_FRAGMENT})`,
  "im"
);
const END_TIME_PATTERN = new RegExp(
  String.raw`^[ \t]*(?:Appointment[ \t]+)?End[ \t]+Time[ \t]*:[ \t]*(${TIME_FRAGMENT})`,
  "im"
);
// Fallback for a single line such as "Time: 8:00 AM - 9:00 AM".
const TIME_RANGE_PATTERN = new RegExp(
  String.raw`^[ \t]*(?:Appointment[ \t]+)?Time[ \t]*:[ \t]*(${TIME_FRAGMENT})[ \t]*(?:-|–|—|to)[ \t]*(${TIME_FRAGMENT})`,
  "im"
);

/** Builds a line-anchored "Label: value" matcher. Labels are trusted regex fragments. */
function labelPattern(labels: readonly string[]): RegExp {
  return new RegExp(String.raw`^[ \t]*(?:${labels.join("|")})[ \t]*:[ \t]*(.+?)[ \t]*$`, "im");
}

const VENUE_PATTERN = labelPattern(["Location", "Location[ \\t]+Name", "Venue", "Facility"]);
const ADDRESS_PATTERN = labelPattern(["Address", "Location[ \\t]+Address", "Street[ \\t]+Address"]);
const FORMAT_PATTERN = labelPattern([
  "Format",
  "Service[ \\t]+Format",
  "Modality",
  "Service[ \\t]+Type",
  "Appointment[ \\t]+Type",
  "Delivery[ \\t]+Method",
]);
const CLIENT_PATTERN = labelPattern([
  "Patient[ \\t]+Name",
  "Client[ \\t]+Name",
  "Consumer[ \\t]+Name",
  "Deaf[ \\t]+(?:Consumer|Client|Participant)",
  "Patient",
  "Client",
  "Consumer",
]);
const PURPOSE_PATTERN = labelPattern([
  "Purpose[ \\t]+of[ \\t]+(?:Appointment|Visit|Assignment)",
  "Appointment[ \\t]+Purpose",
  "Purpose",
  "Reason[ \\t]+for[ \\t]+(?:Appointment|Visit)",
]);

/** Lambda may forward HTML bodies — flatten to plain text lines before matching. */
function normalizeEmailText(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");
  if (/<[a-z][^>]*>/i.test(text)) {
    text = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }
  return text;
}

function cleanValue(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, MAX_FIELD_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

/** Enforces /^[A-Za-z0-9-]{0,40}$/. Anything else is discarded rather than stored. */
function sanitizeSrn(candidate: string | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim().replace(/^#/, "");
  if (trimmed.length === 0 || !SRN_ALLOWED.test(trimmed)) return null;
  return trimmed;
}

function normalizeFormat(value: string | null): AppointmentFormat | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (/hybrid/.test(v)) return "hybrid";
  if (/virtual|remote|\bvri\b|video|zoom|teams|online|telehealth/.test(v)) return "virtual";
  if (/in[\s-]?person|on[\s-]?site|face[\s-]to[\s-]face|physical/.test(v)) return "in_person";
  return null;
}

/** "12/15/2021" | "12/15/21" -> "2021-12-15" */
function toIsoDate(usDate: string): string | null {
  const m = usDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = yy.length === 2 ? `20${yy}` : yy;
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** "8:00 AM" | "8 am" | "12:30 p.m." -> "08:00" | "08:00" | "12:30" */
function to24HourTime(time12: string): string | null {
  const m = time12.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?$/);
  if (!m) return null;
  const [, hh, mi = "00", meridiem] = m;
  let hours = Number(hh);
  if (hours < 1 || hours > 12 || Number(mi) > 59) return null;
  const isPm = meridiem.toUpperCase() === "P";
  if (hours === 12) hours = isPm ? 12 : 0;
  else if (isPm) hours += 12;
  return `${String(hours).padStart(2, "0")}:${mi}`;
}

function parseIntakeEmail(rawContent: string, subject: string): ParsedIntakeEmail {
  const text = normalizeEmailText(rawContent);

  // SRN: body first, then subject line as a fallback.
  let srn: string | null = null;
  for (const source of [text, subject]) {
    for (const pattern of SRN_PATTERNS) {
      srn = sanitizeSrn(source.match(pattern)?.[1]);
      if (srn) break;
    }
    if (srn) break;
  }

  const date = cleanValue(text.match(DATE_PATTERN)?.[1]);

  let startTime = cleanValue(text.match(START_TIME_PATTERN)?.[1]);
  let endTime = cleanValue(text.match(END_TIME_PATTERN)?.[1]);
  if (!startTime) {
    const range = text.match(TIME_RANGE_PATTERN);
    startTime = cleanValue(range?.[1]);
    endTime = endTime ?? cleanValue(range?.[2]);
  }

  const venue = cleanValue(text.match(VENUE_PATTERN)?.[1]);
  const address = cleanValue(text.match(ADDRESS_PATTERN)?.[1]);

  let format = normalizeFormat(cleanValue(text.match(FORMAT_PATTERN)?.[1]));
  let formatInferred = false;
  if (!format && address) {
    // A physical street address with no stated format implies an on-site job.
    format = "in_person";
    formatInferred = true;
  }

  return {
    srn,
    date,
    isoDate: date ? toIsoDate(date) : null,
    startTime,
    endTime,
    start24: startTime ? to24HourTime(startTime) : null,
    end24: endTime ? to24HourTime(endTime) : null,
    venue,
    address,
    format,
    formatInferred,
    clientName: cleanValue(text.match(CLIENT_PATTERN)?.[1]),
    purpose: cleanValue(text.match(PURPOSE_PATTERN)?.[1]),
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
      },
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
        data: requestData,
        // The app reads createdAt as the appointment start (see createRequest); default now() if unparsed.
        ...(startsAt ? { createdAt: startsAt } : {}),
      })
      .returning({ id: requests.id });

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
