import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requests, offers, interpreters } from "@/db/schema";
import { verifyOfferToken } from "@/lib/jwt";
import { revalidatePath } from "next/cache";
import { resolveRequestTimes } from "@/utils/timezone";
import { td_conflict } from "@/app/actions/availability";

export const dynamic = "force-dynamic";

interface HtmlCardParams {
  status: "accepted" | "declined" | "expired";
  title: string;
  message: string;
  subNotice?: string;
  jobDetails?: {
    title: string;
    date?: string;
    time?: string;
    location?: string;
    position?: string;
  };
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

function convertTo12Hour(timeVal: unknown): string {
  if (!timeVal) return "";
  if (Array.isArray(timeVal)) {
    return timeVal.map(convertTo12Hour).filter(Boolean).join(" - ");
  }
  const timeStr = String(timeVal).trim();

  // If already contains AM or PM
  const ampmMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp]\.?[Mm]\.?)$/);
  if (ampmMatch) {
    const hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const period = ampmMatch[3].toUpperCase().replace(/\./g, "");
    return `${hours}:${minutes} ${period}`;
  }

  // Parse military HH:mm or HH:mm:ss
  const militaryMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (militaryMatch) {
    let hours = parseInt(militaryMatch[1], 10);
    const minutes = militaryMatch[2];
    const period = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${hours}:${minutes} ${period}`;
  }

  // If it's a range string like "12:01 – 13:01" or "12:01 - 13:01"
  if (timeStr.includes("–") || timeStr.includes("-") || timeStr.includes("—")) {
    const parts = timeStr.split(/\s*[-–—]\s*/);
    if (parts.length === 2) {
      const start = convertTo12Hour(parts[0]);
      const end = convertTo12Hour(parts[1]);
      return `${start} - ${end}`;
    }
  }

  return timeStr;
}

function formatJobTimeDisplay(
  startTime?: unknown,
  endTime?: unknown,
  timeZoneStr?: string
): string {
  const tzAbbr = getTimeZoneAbbreviation(timeZoneStr);

  // If startTime itself is an array or range
  if (Array.isArray(startTime)) {
    const formatted = startTime.map(convertTo12Hour).filter(Boolean).join(" - ");
    return `${formatted} (${tzAbbr})`;
  }

  if (startTime && endTime) {
    const formattedStart = convertTo12Hour(startTime);
    const formattedEnd = convertTo12Hour(endTime);
    return `${formattedStart} - ${formattedEnd} (${tzAbbr})`;
  }

  if (startTime) {
    const formattedStart = convertTo12Hour(startTime);
    return `${formattedStart} (${tzAbbr})`;
  }

  return `See details upon acceptance (${tzAbbr})`;
}

function renderHtmlCard({
  status,
  title,
  message,
  subNotice,
  jobDetails,
}: HtmlCardParams): Response {
  const isAccepted = status === "accepted";
  const isDeclined = status === "declined";

  const iconCircleBg = isAccepted
    ? "#ecfdf5"
    : isDeclined
    ? "#f1f5f9"
    : "#fffbeb";

  const iconSvg = isAccepted
    ? `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
    : isDeclined
    ? `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    : `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

  const badgeColor = isAccepted
    ? "background-color: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0;"
    : isDeclined
    ? "background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;"
    : "background-color: #fffbeb; color: #92400e; border: 1px solid #fde68a;";

  const detailsHtml = jobDetails
    ? `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin: 24px 0; text-align: left;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Assignment</div>
        <div style="font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 12px;">${jobDetails.title}</div>
        
        ${
          jobDetails.date || jobDetails.time
            ? `
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Scheduled Time</div>
          <div style="font-size: 14px; font-weight: 500; color: #334155; margin-bottom: 12px;">${jobDetails.date || ""} ${jobDetails.time ? `&bull; ${jobDetails.time}` : ""}</div>
        `
            : ""
        }

        ${
          jobDetails.location
            ? `
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Location / Platform</div>
          <div style="font-size: 14px; font-weight: 500; color: #334155; margin-bottom: 12px;">${jobDetails.location}</div>
        `
            : ""
        }

        ${
          jobDetails.position
            ? `
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Role</div>
          <div style="font-size: 14px; font-weight: 500; color: #334155;">${jobDetails.position}</div>
        `
            : ""
        }
      </div>
    `
    : "";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - TerpDesk</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background-color: #F9FAFB;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background-color: #ffffff;
      max-width: 448px;
      width: 100%;
      border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      border: 1px solid #f3f4f6;
      overflow: hidden;
      text-align: center;
    }
    .header {
      background-color: #163C3A;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header-title {
      color: #ffffff;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.025em;
      margin: 0;
    }
    .header-badge {
      font-size: 11px;
      color: #AEC3B0;
      text-transform: uppercase;
      font-weight: 400;
      letter-spacing: 0.05em;
    }
    .content {
      padding: 32px;
    }
    .icon-container {
      width: 72px;
      height: 72px;
      background-color: ${iconCircleBg};
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 12px;
      letter-spacing: -0.4px;
    }
    .message {
      font-size: 15px;
      color: #475569;
      line-height: 1.55;
      margin: 0;
    }
    .sub-notice {
      margin-top: 20px;
      font-size: 13px;
      color: #64748b;
      line-height: 1.5;
    }
    .footer {
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 16px 24px;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <span class="header-title">TerpDESK</span>
    </div>
    <div class="content">
      <div class="icon-container">
        ${iconSvg}
      </div>
      <h1 class="title">${title}</h1>
      <p class="message">${message}</p>

      ${detailsHtml}

      ${subNotice ? `<div class="sub-notice">${subNotice}</div>` : ""}
    </div>
    <div class="footer">
      TerpDesk Dispatch Automation &bull; Secure Magic Link Response
    </div>
  </div>
</body>
</html>
  `.trim();

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get("token");
  const actionParam = searchParams.get("action")?.trim().toLowerCase();

  // 1. Validate query parameters
  if (!token || !actionParam || (actionParam !== "accept" && actionParam !== "decline")) {
    return renderHtmlCard({
      status: "expired",
      title: "Offer Expired or Invalid",
      message:
        "This link has expired or has already been used. Please reach out to the agency directly.",
    });
  }

  // 2. Validate JWT token
  const payload = verifyOfferToken(token);
  if (!payload || !payload.interpreterId || !payload.requestId) {
    return renderHtmlCard({
      status: "expired",
      title: "Offer Expired or Invalid",
      message:
        "This link has expired or has already been used. Please reach out to the agency directly.",
    });
  }

  const { interpreterId, requestId, positionNumber } = payload;
  const positionIndex = (positionNumber === 2 ? 2 : 1) as 1 | 2;

  try {
    // 3. Fetch request from database
    const [parentReq] = await db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .limit(1);

    if (!parentReq) {
      return renderHtmlCard({
        status: "expired",
        title: "Offer Expired or Invalid",
        message:
          "This link has expired or has already been used. Please reach out to the agency directly.",
      });
    }

    // 4. Fetch interpreter details for name formatting
    const [interpreterRecord] = await db
      .select()
      .from(interpreters)
      .where(eq(interpreters.id, interpreterId))
      .limit(1);

    const interpreterName = interpreterRecord?.name || "Assigned Interpreter";

    // Extract request details for HTML card
    const existingData = (parentReq.data as Record<string, any>) || {};
    const details = existingData.details || {};
    const onsite = existingData.onsite || {};
    const jobTitle = parentReq.title || details.title || "Interpreting Assignment";
    const jobDate = details.date || details.appointmentDate || existingData.date;

    const reqTimeZone =
      details.timeZone ||
      details.timezone ||
      existingData.timeZone ||
      existingData.timezone ||
      (parentReq as any).timeZone;

    const rawStartTime = details.startTime || existingData.startTime;
    const rawEndTime = details.endTime || existingData.endTime;

    let jobTime = `See details upon acceptance (${getTimeZoneAbbreviation(reqTimeZone)})`;
    if (rawStartTime && rawEndTime) {
      jobTime = formatJobTimeDisplay(rawStartTime, rawEndTime, reqTimeZone);
    } else if (rawStartTime) {
      jobTime = formatJobTimeDisplay(rawStartTime, undefined, reqTimeZone);
    }
    const jobLocation =
      details.format === "Virtual" || existingData.format === "Virtual"
        ? "Virtual / Remote"
        : [onsite.venue, onsite.address].filter(Boolean).join(" · ") ||
          existingData.location ||
          "On-site";
    const roleLabel = positionIndex === 2 ? "Secondary Interpreter (Position 2)" : "Primary Interpreter";

    const totalPositions =
      existingData.slotCount === 2 ||
      existingData.details?.slotCount === 2 ||
      existingData.positions === "Team — two independent positions" ||
      existingData.requiredPositions === 2
        ? 2
        : 1;
    const otherPos = positionIndex === 1 ? 2 : 1;
    const existingOfferPositions = existingData.offerPositions || {};

    const now = new Date();
    const blockedCard = () =>
      renderHtmlCard({
        status: "expired",
        title: "Offer Expired or Invalid",
        message:
          "This link has expired or has already been used. Please reach out to the agency directly.",
      });

    // 5. STATE LOCK: re-read the current database state before mutating anything
    const [freshReq] = await db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .limit(1);
    if (!freshReq) return blockedCard();

    const freshData = (freshReq.data as Record<string, any>) || {};
    const freshOfferPositions: Record<string, number> = freshData.offerPositions || {};
    const positionOf = (offerId: string): number => freshOfferPositions[offerId] || 1;

    const freshStatus = String(freshReq.status || "").toLowerCase();
    if (freshStatus === "cancelled" || freshStatus === "canceled") return blockedCard();

    const lockOffers = await db.select().from(offers).where(eq(offers.requestId, requestId));

    // Position already filled by someone else (accepted offer or reserved slot)?
    const filledByOtherOffer = lockOffers.some(
      (o) =>
        o.status === "accepted" &&
        o.interpreterId !== interpreterId &&
        positionOf(o.id) === positionIndex
    );
    const slotForPosition = (freshData.slots as any[] | undefined)?.find(
      (s: any) => s.positionIndex === positionIndex
    );
    const filledByOtherSlot = Boolean(
      slotForPosition?.reservedBy && slotForPosition.reservedBy !== interpreterId
    );
    if (filledByOtherOffer || filledByOtherSlot) return blockedCard();

    // The offer must still be Pending (and unexpired) for this interpreter and position
    const pendingOffer = lockOffers.find(
      (o) =>
        o.interpreterId === interpreterId &&
        o.status === "pending" &&
        positionOf(o.id) === positionIndex &&
        new Date(o.expiresAt) > now
    );
    if (!pendingOffer) return blockedCard();

    if (actionParam === "accept") {
      // 1. Enforce hard block on double-booking: query database for active, filled bookings overlapping this time block
      const { startsAt: reqStartsAt, endsAt: reqEndsAt } = resolveRequestTimes(freshReq);
      const targetStart = new Date(reqStartsAt);
      const targetEnd = new Date(reqEndsAt);

      // Query database for all accepted offers for this interpreter
      const conflictOffers = await db
        .select({
          offerId: offers.id,
          requestId: offers.requestId,
          status: offers.status,
          reqStatus: requests.status,
          reqData: requests.data,
          reqCreatedAt: requests.createdAt,
        })
        .from(offers)
        .innerJoin(requests, eq(offers.requestId, requests.id))
        .where(
          and(
            eq(offers.interpreterId, interpreterId),
            eq(offers.status, "accepted")
          )
        );

      let hasScheduleConflict = false;

      for (const row of conflictOffers) {
        if (row.requestId === requestId) continue;
        const rowStatus = String(row.reqStatus || "").toLowerCase();
        if (rowStatus === "cancelled" || rowStatus === "canceled") continue;

        const { startsAt: existingStartStr, endsAt: existingEndStr } = resolveRequestTimes({
          createdAt: row.reqCreatedAt,
          data: row.reqData,
        });
        const exStart = new Date(existingStartStr);
        const exEnd = new Date(existingEndStr);

        // Check for time overlap
        if (exStart < targetEnd && exEnd > targetStart) {
          hasScheduleConflict = true;
          break;
        }
      }

      // Check active requests directly to catch any filled bookings where the interpreter is assigned in requests.data
      if (!hasScheduleConflict) {
        const activeFilledRequests = await db
          .select({
            id: requests.id,
            status: requests.status,
            data: requests.data,
            createdAt: requests.createdAt,
          })
          .from(requests);

        for (const reqRow of activeFilledRequests) {
          if (reqRow.id === requestId) continue;
          const reqStat = String(reqRow.status || "").toLowerCase();
          if (reqStat === "cancelled" || reqStat === "canceled") continue;

          const rData = (reqRow.data as Record<string, any>) || {};
          const isAssigned =
            rData.assignedInterpreterId === interpreterId ||
            rData.position2InterpreterId === interpreterId ||
            (Array.isArray(rData.slots) &&
              rData.slots.some((s: any) => s.reservedBy === interpreterId));

          if (isAssigned) {
            const { startsAt: exStartStr, endsAt: exEndStr } = resolveRequestTimes({
              createdAt: reqRow.createdAt,
              data: rData,
            });
            const exStart = new Date(exStartStr);
            const exEnd = new Date(exEndStr);

            if (exStart < targetEnd && exEnd > targetStart) {
              hasScheduleConflict = true;
              break;
            }
          }
        }
      }

      // Also check private busy blocks and resolved mock IDs via td_conflict
      if (!hasScheduleConflict) {
        try {
          const conflictCheck = await td_conflict({
            interpreterId,
            startsAtUtc: reqStartsAt,
            endsAtUtc: reqEndsAt,
            excludeRequestId: requestId,
          });
          if (conflictCheck.hasConflict) {
            hasScheduleConflict = true;
          }
        } catch (e) {
          console.error("Conflict check evaluation error:", e);
        }
      }

      if (hasScheduleConflict) {
        return renderHtmlCard({
          status: "expired",
          title: "Schedule Conflict",
          message: "Schedule Conflict: You already have a booked assignment during this time.",
          subNotice: "Please resolve the scheduling conflict with the agency before accepting this offer.",
          jobDetails: {
            title: jobTitle,
            date: jobDate,
            time: jobTime,
            location: jobLocation,
            position: roleLabel,
          },
        });
      }

      // Atomically claim the offer: only succeeds if it is still pending at write time
      const [targetOffer] = await db
        .update(offers)
        .set({ status: "accepted", updatedAt: now })
        .where(and(eq(offers.id, pendingOffer.id), eq(offers.status, "pending")))
        .returning();
      if (!targetOffer) return blockedCard();

      // Withdraw other pending offers specifically for this position
      const allReqOffers = await db
        .select()
        .from(offers)
        .where(eq(offers.requestId, requestId));

      for (const off of allReqOffers) {
        const offPos = existingOfferPositions[off.id] || 1;
        if (off.id !== targetOffer.id && offPos === positionIndex && off.status === "pending") {
          await db
            .update(offers)
            .set({ status: "withdrawn", updatedAt: now })
            .where(eq(offers.id, off.id));
        }
      }

      const updatedOfferPositions = {
        ...existingOfferPositions,
        [targetOffer.id]: positionIndex,
      };

      const updatedSlotReplacements = {
        ...(existingData.slotReplacements || {}),
        [positionIndex]: false,
      };

      const otherPosBooked =
        totalPositions === 2 &&
        allReqOffers.some((o) => {
          const p = updatedOfferPositions[o.id] || 1;
          return o.id !== targetOffer.id && p === otherPos && o.status === "accepted";
        });

      let newStatus = "booked";
      if (totalPositions === 2) {
        if (otherPosBooked) {
          newStatus = "booked";
        } else if (updatedSlotReplacements[otherPos]) {
          newStatus = "Needs replacement";
        } else {
          newStatus = "Partially staffed";
        }
      }

      const updatedSlots = [
        {
          id: positionIndex === 1 ? targetOffer.id : existingData.slots?.[0]?.id || "slot-1",
          positionIndex: 1,
          active: true,
          reservedBy: positionIndex === 1 ? interpreterId : existingData.slots?.[0]?.reservedBy || null,
          interpreterName:
            positionIndex === 1 ? interpreterName : existingData.slots?.[0]?.interpreterName || undefined,
          needsReplacement: positionIndex === 1 ? false : Boolean(updatedSlotReplacements[1]),
          followUp: false,
        },
        ...(totalPositions === 2
          ? [
              {
                id: positionIndex === 2 ? targetOffer.id : existingData.slots?.[1]?.id || "slot-2",
                positionIndex: 2,
                active: true,
                reservedBy: positionIndex === 2 ? interpreterId : existingData.slots?.[1]?.reservedBy || null,
                interpreterName:
                  positionIndex === 2 ? interpreterName : existingData.slots?.[1]?.interpreterName || undefined,
                needsReplacement: positionIndex === 2 ? false : Boolean(updatedSlotReplacements[2]),
                followUp: false,
              },
            ]
          : []),
      ];

      // Update requests record parameter-safely linking the accepted interpreter
      await db
        .update(requests)
        .set({
          status: newStatus,
          data: {
            ...existingData,
            offerPositions: updatedOfferPositions,
            slotReplacements: updatedSlotReplacements,
            slots: updatedSlots,
            assignedInterpreterId:
              positionIndex === 1 ? interpreterId : existingData.assignedInterpreterId || null,
            assignedInterpreterName:
              positionIndex === 1 ? interpreterName : existingData.assignedInterpreterName || interpreterName,
          },
          updatedAt: now,
        })
        .where(eq(requests.id, requestId));

      try {
        revalidatePath(`/requests/${requestId}`);
        revalidatePath("/requests");
        revalidatePath("/dashboard");
        revalidatePath("/jobs");
        revalidatePath("/interpreter-home");
      } catch {
        // Revalidation may fail outside Next.js request context; ignore safely
      }

      return renderHtmlCard({
        status: "accepted",
        title: "Offer Accepted!",
        message:
          "You're locked in for this assignment. Job details and prep notes have been logged.",
        jobDetails: {
          title: jobTitle,
          date: jobDate,
          time: jobTime,
          location: jobLocation,
          position: roleLabel,
        },
      });
    } else {
      // Action is 'decline'
      const [targetOffer] = await db
        .update(offers)
        .set({ status: "declined", updatedAt: now })
        .where(and(eq(offers.id, pendingOffer.id), eq(offers.status, "pending")))
        .returning();
      if (!targetOffer) return blockedCard();

      // Also mark any other pending offers for this interpreter on this request as declined
      await db
        .update(offers)
        .set({ status: "declined", updatedAt: now })
        .where(
          and(
            eq(offers.requestId, requestId),
            eq(offers.interpreterId, interpreterId),
            eq(offers.status, "pending")
          )
        );

      // 2. Fetch all offers to accurately evaluate remaining staffing
      const allReqOffers = await db
        .select()
        .from(offers)
        .where(eq(offers.requestId, requestId));

      const remainingAccepted = allReqOffers.filter(
        (o) => o.interpreterId !== interpreterId && o.status === "accepted"
      );
      const remainingPending = allReqOffers.some(
        (o) => o.interpreterId !== interpreterId && o.status === "pending" && new Date(o.expiresAt) > now
      );
      const hasReplacement = Boolean(
        existingData.slotReplacements?.[1] || existingData.slotReplacements?.[2]
      );

      // Determine request status
      let newStatus = "Unfilled / draft";
      if (remainingAccepted.length >= totalPositions && totalPositions > 0) {
        newStatus = "booked";
      } else if (hasReplacement) {
        newStatus = "Needs replacement";
      } else if (remainingAccepted.length > 0) {
        newStatus = "Partially staffed";
      } else if (remainingPending) {
        newStatus = "Offer awaiting response";
      }

      // 3. Explicitly reset slots and assigned interpreter fields for the declined position
      const currentSlots = existingData.slots || [
        { positionIndex: 1, active: false, reservedBy: null, interpreterName: undefined },
        ...(totalPositions === 2
          ? [{ positionIndex: 2, active: false, reservedBy: null, interpreterName: undefined }]
          : []),
      ];

      const updatedSlots = currentSlots.map((s: any) => {
        if (s.positionIndex === positionIndex || (!s.positionIndex && positionIndex === 1)) {
          return {
            ...s,
            active: false,
            reservedBy: null,
            assignedInterpreterId: null,
            interpreterName: undefined,
            needsReplacement: false,
          };
        }
        return s;
      });

      const updatedData: Record<string, any> = {
        ...existingData,
        slots: updatedSlots,
      };

      if (positionIndex === 1) {
        updatedData.assignedInterpreterId = null;
        updatedData.assignedInterpreterName = null;
      } else if (positionIndex === 2) {
        updatedData.position2InterpreterId = null;
        updatedData.position2InterpreterName = null;
      }

      if (updatedData.overview) {
        updatedData.overview = {
          ...updatedData.overview,
          status: newStatus,
        };
      }

      // 4. Update the requests table explicitly clearing assigned interpreter and setting unfilled status
      await db
        .update(requests)
        .set({
          status: newStatus,
          data: updatedData,
          updatedAt: now,
        })
        .where(eq(requests.id, requestId));

      try {
        revalidatePath(`/requests/${requestId}`);
        revalidatePath("/requests");
        revalidatePath("/dashboard");
        revalidatePath("/jobs");
        revalidatePath("/interpreter-home");
      } catch {
        // Safe to ignore revalidation failure in isolated test contexts
      }

      return renderHtmlCard({
        status: "declined",
        title: "Offer Declined",
        message: "Thank you for responding promptly.",
        subNotice: "The agency dispatch dashboard has been notified of the vacancy.",
        jobDetails: {
          title: jobTitle,
          date: jobDate,
          time: jobTime,
          location: jobLocation,
          position: roleLabel,
        },
      });
    }
  } catch (err) {
    console.error("[Offer Response] Error processing offer response:", err);
    return renderHtmlCard({
      status: "expired",
      title: "Offer Expired or Invalid",
      message:
        "This link has expired or has already been used. Please reach out to the agency directly.",
    });
  }
}
