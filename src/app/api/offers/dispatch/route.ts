import { getBaseUrl } from "@/lib/baseUrl";
import { hasRole } from "@/lib/auth/guards";
import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { generateOfferToken } from "@/lib/jwt";
import { formatReference } from "@/utils/statusEngine";
import { buildTerpDeskEmail, emailActionCard, emailButton, emailDetailsTable, emailSecondaryButton } from "@/lib/emailTemplate";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface DispatchOfferBody {
  interpreterId: string;
  requestId: string;
  interpreterEmail: string;
  positionNumber?: number;
}

function getTimeZoneAbbreviation(tz?: string): string {
  if (!tz || typeof tz !== "string") return "PST";
  const lower = tz.toLowerCase();
  if (lower.includes("hawaii") || lower.includes("honolulu") || lower.includes("hst")) return "HST";
  if (lower.includes("alaska") || lower.includes("anchorage") || lower.includes("akst") || lower.includes("akdt")) return "AKST";
  if (lower.includes("pacific") || lower.includes("los angeles") || lower.includes("seattle") || lower.includes("pst") || lower.includes("pdt")) return "PST";
  if (lower.includes("mountain") || lower.includes("denver") || lower.includes("mst") || lower.includes("mdt") || lower.includes("phoenix") || lower.includes("arizona")) return "MST";
  if (lower.includes("central") || lower.includes("chicago") || lower.includes("cst") || lower.includes("cdt")) return "CST";
  if (lower.includes("eastern") || lower.includes("new york") || lower.includes("est") || lower.includes("edt")) return "EST";
  return "PST";
}

function convertTo12Hour(timeStr: string): string {
  if (!timeStr) return "";
  const trimmed = timeStr.trim();

  // If already contains AM or PM
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp]\.?[Mm]\.?)$/);
  if (ampmMatch) {
    const hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const period = ampmMatch[3].toUpperCase().replace(/\./g, "");
    return `${hours}:${minutes} ${period}`;
  }

  // Parse military HH:mm or HH:mm:ss
  const militaryMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (militaryMatch) {
    let hours = parseInt(militaryMatch[1], 10);
    const minutes = militaryMatch[2];
    const period = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${hours}:${minutes} ${period}`;
  }

  return trimmed;
}

function formatJobTimeDisplay(
  startTime?: string,
  endTime?: string,
  timeZoneStr?: string
): string {
  const tzAbbr = getTimeZoneAbbreviation(timeZoneStr);

  if (startTime && endTime) {
    const formattedStart = convertTo12Hour(startTime);
    const formattedEnd = convertTo12Hour(endTime);
    return `${formattedStart} – ${formattedEnd} ${tzAbbr}`;
  }

  if (startTime) {
    const formattedStart = convertTo12Hour(startTime);
    return `${formattedStart} ${tzAbbr}`;
  }

  return `See details upon acceptance (${tzAbbr})`;
}

export async function POST(req: Request) {
  try {
    if (!(await hasRole("agency"))) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as Partial<DispatchOfferBody>;
    const { interpreterId, requestId, interpreterEmail, positionNumber } = body;

    if (!interpreterId || !requestId || !interpreterEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: interpreterId, requestId, and interpreterEmail must be provided.",
        },
        { status: 400 }
      );
    }

    // 1. Generate signed zero-login offer token
    const token = generateOfferToken({
      interpreterId,
      requestId,
      ...(typeof positionNumber === "number" ? { positionNumber } : {}),
    });

    // 2. Construct Magic Link action URLs
    const appUrl = getBaseUrl();
    const acceptUrl = `${appUrl}/api/offers/response?token=${token}&action=accept`;
    const declineUrl = `${appUrl}/api/offers/response?token=${token}&action=decline`;

    // 3. Fetch request details to populate email job summary
    let jobTitle = "Interpreting Assignment";
    let jobDate = "Scheduled Appointment";
    let jobTime = "See details upon acceptance (PST)";
    let jobLocation = "On-site / Virtual";
    let jobSetting = "General Interpreting";
    let jobFormat = "In person";

    try {
      const [requestRecord] = await db
        .select()
        .from(requests)
        .where(eq(requests.id, requestId))
        .limit(1);

      if (requestRecord) {
        if (requestRecord.title) {
          jobTitle = requestRecord.title;
        }

        const data = (requestRecord.data as Record<string, any>) || {};
        const details = data.details || {};
        const onsite = data.onsite || {};

        const reqTimeZone =
          details.timeZone ||
          details.timezone ||
          data.timeZone ||
          data.timezone ||
          (requestRecord as any).timeZone;

        if (details.date || details.appointmentDate || data.date) {
          jobDate = details.date || details.appointmentDate || data.date;
        }

        const rawStartTime = details.startTime || data.startTime;
        const rawEndTime = details.endTime || data.endTime;

        if (rawStartTime && rawEndTime) {
          jobTime = formatJobTimeDisplay(rawStartTime, rawEndTime, reqTimeZone);
        } else if (rawStartTime) {
          jobTime = formatJobTimeDisplay(rawStartTime, undefined, reqTimeZone);
        } else {
          jobTime = `See details upon acceptance (${getTimeZoneAbbreviation(reqTimeZone)})`;
        }

        if (details.format === "Virtual" || data.format === "Virtual") {
          jobLocation = "Virtual / Remote Video";
        } else if (onsite.venue || onsite.address || data.location) {
          const venue = onsite.venue ? onsite.venue : "";
          const address = onsite.address ? onsite.address : "";
          jobLocation = [venue, address].filter(Boolean).join(" · ") || data.location || "On-site";
        }

        if (details.setting || data.setting) {
          jobSetting = details.setting || data.setting;
        }

        // Same fallback chain the web UI uses for the Format badge.
        jobFormat =
          requestRecord && (details.format || data.format)
            ? String(details.format || data.format)
            : data.isVirtual
              ? "Virtual"
              : "In person";
      }
    } catch (dbErr) {
      console.warn("[Offer Dispatch] Could not load request details from DB, using defaults:", dbErr);
    }

    const jobReference = formatReference(requestId);
    const posLabel = positionNumber ? `Position #${positionNumber}` : "Primary Interpreter";

    // 4. Construct professional TerpDesk HTML Email
    const htmlEmail = buildTerpDeskEmail({
      title: `Job Offer: ${jobTitle}`,
      preheader: `A new interpreting assignment offer for ${jobDate}. Please respond promptly.`,
      bodyContent: `
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">You have a new job offer</h1>
        <p style="margin:0 0 4px;">An agency dispatch coordinator has issued you an interpreting assignment offer. Please review the details below and respond promptly.</p>
        ${emailActionCard(`
          ${emailDetailsTable([
            { label: "Reference", value: jobReference },
            { label: "Assignment", value: jobTitle },
            { label: "Date & time", value: `${jobDate} · ${jobTime}` },
            { label: "Format", value: jobFormat },
            { label: "Location", value: jobLocation },
            { label: "Setting & role", value: `${jobSetting} · ${posLabel}` },
          ])}
          <p style="margin:20px 0 12px;">${emailButton("Accept Job Offer", acceptUrl)}</p>
          <p style="margin:0;">${emailSecondaryButton("Decline Offer", declineUrl)}</p>
        `)}
        <p style="margin:0 0 8px;font-size:13px;color:#6B7280;"><strong>Zero-login link:</strong> no password is required. Clicking either button immediately logs your response with the agency dispatch office.</p>
        <p style="margin:0;font-size:13px;color:#6B7280;">This offer link is valid for 48 hours from dispatch. If you have questions or schedule conflicts, please contact your dispatch coordinator.</p>`,
    });

    const textEmail = `
New Interpreting Job Offer - TerpDesk Dispatch

You have received an exclusive interpreting job offer:
Reference: ${jobReference}
Assignment: ${jobTitle}
Date & Time: ${jobDate} (${jobTime})
Format: ${jobFormat}
Location: ${jobLocation}
Setting: ${jobSetting} (${posLabel})

To ACCEPT this offer directly:
${acceptUrl}

To DECLINE this offer:
${declineUrl}

Zero-Login Enabled: No portal login or password required. Your link is valid for 48 hours.
    `.trim();

    // 5. Dispatch email via AWS SES
    const sesClient = new SESClient({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-west-2",
    });

    const senderEmail = "dispatch@aslprofessionals.net";

    const command = new SendEmailCommand({
      Source: senderEmail,
      Destination: {
        ToAddresses: [interpreterEmail],
      },
      Message: {
        Subject: {
          Data: `Job Offer: ${jobTitle} - TerpDesk`,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: htmlEmail,
            Charset: "UTF-8",
          },
          Text: {
            Data: textEmail,
            Charset: "UTF-8",
          },
        },
      },
    });

    const sendResult = await sesClient.send(command);

    return NextResponse.json({
      success: true,
      messageId: sendResult.MessageId,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[Offer Dispatch] Error sending offer email via SES:", err);
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}