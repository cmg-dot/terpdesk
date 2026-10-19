export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { db } from "@/db";
import { requests, type RequestData } from "@/db/schema";

// ODHH is a Washington State agency — all appointment times are Pacific.
const ODHH_TIME_ZONE_IANA = "America/Los_Angeles";
const ODHH_TIME_ZONE_LABEL = "Pacific Time — Seattle, Los Angeles";

interface OdhhIntakePayload {
  rawEmailText: string;
}

interface ParsedOdhhEmail {
  srn: string;
  date: string;
  startTime: string;
  endTime: string;
  locationName: string;
  locationAddress: string;
  requestorName: string | null;
}

type ParseResult =
  | { ok: true; data: ParsedOdhhEmail }
  | { ok: false; missingFields: string[] };

// Line-anchored (multiline), case-insensitive, tolerant of extra whitespace and \r\n.
const PATTERNS = {
  srn: /^\s*Service\s+Request\s*#\s*(\d+)\s*$/im,
  date: /^\s*Appointment\s+Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*$/im,
  startTime: /^\s*Appointment\s+Start\s+Time:\s*(\d{1,2}:\d{2}\s*[AP]\.?M\.?)\s*$/im,
  endTime: /^\s*Appointment\s+End\s+Time:\s*(\d{1,2}:\d{2}\s*[AP]\.?M\.?)\s*$/im,
  locationName: /^\s*Location:[ \t]*(.+?)[ \t]*$/im,
  locationAddress: /^\s*Address:[ \t]*(.+?)[ \t]*$/im,
  requestorName: /^\s*Requestor\s+Name:[ \t]*(.+?)[ \t]*$/im,
} as const;

type RequiredField = Exclude<keyof typeof PATTERNS, "requestorName">;
const REQUIRED_FIELDS: readonly RequiredField[] = [
  "srn",
  "date",
  "startTime",
  "endTime",
  "locationName",
  "locationAddress",
];

function isIntakePayload(body: unknown): body is OdhhIntakePayload {
  return (
    typeof body === "object" &&
    body !== null &&
    "rawEmailText" in body &&
    typeof (body as Record<string, unknown>).rawEmailText === "string" &&
    ((body as Record<string, unknown>).rawEmailText as string).trim().length > 0
  );
}

function parseOdhhEmail(rawEmailText: string): ParseResult {
  const text = rawEmailText.replace(/\r\n?/g, "\n");
  const extracted: Partial<Record<RequiredField, string>> = {};
  const missingFields: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const match = text.match(PATTERNS[field]);
    const value = match?.[1]?.trim();
    if (value) {
      extracted[field] = value;
    } else {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return { ok: false, missingFields };
  }

  const requestorMatch = text.match(PATTERNS.requestorName);

  return {
    ok: true,
    data: {
      srn: extracted.srn as string,
      date: extracted.date as string,
      startTime: extracted.startTime as string,
      endTime: extracted.endTime as string,
      locationName: extracted.locationName as string,
      locationAddress: extracted.locationAddress as string,
      requestorName: requestorMatch?.[1]?.trim() || null,
    },
  };
}

/** "12/15/2021" -> "2021-12-15" */
function toIsoDate(usDate: string): string | null {
  const m = usDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** "8:00 AM" -> "08:00", "12:30 PM" -> "12:30", "12:00 AM" -> "00:00" */
function to24HourTime(time12: string): string | null {
  const m = time12.match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
  if (!m) return null;
  const [, hh, mi, meridiem] = m;
  let hours = Number(hh);
  const minutes = Number(mi);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  const isPm = meridiem.toUpperCase() === "P";
  if (hours === 12) hours = isPm ? 12 : 0;
  else if (isPm) hours += 12;
  return `${String(hours).padStart(2, "0")}:${mi}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!isIntakePayload(body)) {
    return NextResponse.json(
      { success: false, error: "Payload must include a non-empty 'rawEmailText' string." },
      { status: 400 }
    );
  }

  const parsed = parseOdhhEmail(body.rawEmailText);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to parse ODHH email.",
        missingFields: parsed.missingFields,
      },
      { status: 400 }
    );
  }

  const { data } = parsed;
  const isoDate = toIsoDate(data.date);
  const start24 = to24HourTime(data.startTime);
  const end24 = to24HourTime(data.endTime);

  if (!isoDate || !start24 || !end24) {
    return NextResponse.json(
      {
        success: false,
        error: "Parsed date/time values are malformed.",
        parsed: data,
      },
      { status: 400 }
    );
  }

  const startsAt = fromZonedTime(`${isoDate}T${start24}:00`, ODHH_TIME_ZONE_IANA);
  const endsAt = fromZonedTime(`${isoDate}T${end24}:00`, ODHH_TIME_ZONE_IANA);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json(
      {
        success: false,
        error: "Appointment end time must be after start time.",
        parsed: data,
      },
      { status: 400 }
    );
  }

  const requestData: RequestData = {
    brief: {},
    intake: {
      program: "WA ODHH",
      odhhSrn: data.srn,
    },
    source: {
      channel: "odhh_email",
      receivedAt: new Date().toISOString(),
      rawEmailText: body.rawEmailText,
    },
    overview: { location: data.locationName, status: "Unfilled / draft" },
    details: { format: "On-site", timeZone: ODHH_TIME_ZONE_LABEL },
    onsite: { venue: data.locationName, address: data.locationAddress },
    requester: { name: data.requestorName ?? undefined, org: "WA ODHH" },
    schedule: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
    positions: "Single interpreter",
    requiredPositions: 1,
  };

  try {
    const [inserted] = await db
      .insert(requests)
      .values({
        title: `ODHH SRN #${data.srn} — ${data.locationName}`,
        status: "draft",
        isStateJob: true,
        // Matches createRequest: createdAt is used as the appointment start across the app.
        createdAt: startsAt,
        data: requestData,
      })
      .returning({ id: requests.id });

    revalidatePath("/requests");
    revalidatePath("/dashboard");
    revalidatePath("/calendar");

    return NextResponse.json(
      {
        success: true,
        id: inserted.id,
        parsed: {
          ...data,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[ODHH intake] Database insert failed:", err);
    return NextResponse.json(
      { success: false, error: "Database insert failed." },
      { status: 500 }
    );
  }
}
