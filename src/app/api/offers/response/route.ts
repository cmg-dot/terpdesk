import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requests, offers } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { verifyOfferToken } from "@/lib/jwt";
import { revalidatePath } from "next/cache";
import { resolveRequestTimes } from "@/utils/timezone";
import { td_conflict } from "@/lib/availability/conflict";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { alertAgency } from "@/lib/lifecycleAlerts";
import { logError } from "@/lib/logError";
import { interpreterHoldsOtherPosition, isPositionTakenByOther, lockRequestForPosition } from "@/lib/positionClaim";
import { logActivity } from "@/lib/requestActivity";
import { sendBookingConfirmation } from "@/lib/jobEmails";
import { renderOfferConfirmPage } from "@/lib/offerConfirmPage";
import { receiptDateLabel, renderHtmlCard } from "@/lib/offerReceiptCard";
import { resolveOfferLinkState } from "@/lib/offerLinkState";
import { offerCardTitle } from "@/lib/offerPlace";
import { offerAnswerColumns } from "@/lib/acceptAnswers";
import type { AcceptAnswers } from "@/lib/acceptAnswers";
import { confirmPageWithProblem, readAcceptAnswers } from "@/lib/offerLinkAnswers";
import { isActivePosition, positionIdOf, positionLabel, positionOfOffer as positionOfOfferIn, positionRole, readPositions } from "@/lib/positions";
import { assignmentFields, assignedInterpreterIdAt, clearedAssignmentFields, rebuildSlots, staffingFacts, statusAfterBooking, statusAfterDecline } from "@/lib/staffing";

export const dynamic = "force-dynamic";

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

/**
 * Applies the interpreter's answer. Called ONLY from POST (the confirm button), never from opening a link, so a mail
 * scanner or link preview cannot book or decline anything. Every check runs before any write, all writes happen in
 * one transaction, and the confirmation email and notifications are sent only after it has committed. An expired or
 * invalid link therefore changes nothing and sends nothing.
 */
async function processResponse(token: string | null, actionParam: string | undefined, answers: AcceptAnswers | null): Promise<Response> {

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
  const positionIndex = positionIdOf(positionNumber);
  // Set once the database write has committed. After that, nothing may report "expired": the answer is recorded.
  let committed: "accepted" | "declined" | null = null;

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

    // 4. The name agencies see (preferred name, else account name); it is also stored on the booking below.
    const interpreterName = (await getInterpreterDisplayName(interpreterId)) || "Assigned Interpreter";

    // Extract request details for HTML card
    const existingData = (parentReq.data as Record<string, any>) || {};
    const details = existingData.details || {};
    const onsite = existingData.onsite || {};
    // "ODHH <SRN> - <organization>" on a state job, as in the app and on the confirm page (lib/offerPlace.ts); else the job's title.
    const jobTitle = offerCardTitle({ title: parentReq.title || (typeof details.title === "string" ? details.title : null), data: parentReq.data });
    // The receipt's date, in the app's own words (state jobs keep it in the schedule, so `details.date` is often empty).
    const jobDate = receiptDateLabel(parentReq, details.date || details.appointmentDate || existingData.date);

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
    const roleLabel = positionRole(existingData, positionIndex);
    const positionText = positionLabel(existingData, positionIndex);
    // Progressive disclosure: anyone who has not (or will not) accept sees no exact address.
    const restrictedLocation = jobLocation === "Virtual / Remote" ? "Virtual" : "Shared after you accept";

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
    const positionOf = (offerId: string): number => positionOfOfferIn(freshOfferPositions, offerId);

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

    // A link made for one specific offer only ever means that offer, so an older email stops working once its offer
    // has been replaced (for example after the request was edited and the interpreter was offered it again).
    const forThisLink = (o: (typeof lockOffers)[number]) => !payload.offerId || o.id === payload.offerId;

    // Already booked through this offer (a repeat click, or something opened the link first): say so truthfully and do
    // nothing else, so there is no second write and no second email.
    if (actionParam === "accept") {
      const alreadyAccepted = lockOffers.find(
        (o) =>
          o.interpreterId === interpreterId &&
          o.status === "accepted" &&
          positionOf(o.id) === positionIndex &&
          forThisLink(o)
      );
      if (alreadyAccepted) {
        return renderHtmlCard({
          status: "accepted",
          title: "You're already booked",
          message: "This offer was already accepted, so there is nothing more to do. Your confirmation email has been sent.",
          jobDetails: { title: jobTitle, date: jobDate, time: jobTime, position: roleLabel },
        });
      }
    }

    // The offer must still be Pending (and unexpired) for this interpreter and position
    const pendingOffer = lockOffers.find(
      (o) =>
        o.interpreterId === interpreterId &&
        o.status === "pending" &&
        positionOf(o.id) === positionIndex &&
        forThisLink(o) &&
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
          logError("Offer Response conflict check", e);
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
            location: restrictedLocation,
            position: roleLabel,
          },
        });
      }

      // One transaction: claim the offer, withdraw the position's other offers and book the request, or none of it.
      const claimed = await db.transaction(async (tx) => {
      // Lock the request row and re-check the position inside the transaction: two interpreters accepting the same
      // position at the same moment are serialised here, so only the first one gets it.
      const lockedReq = await lockRequestForPosition(tx, requestId);
      if (!lockedReq || (await isPositionTakenByOther(tx, requestId, lockedReq, positionIndex, interpreterId))) return null;
      // The position must still be part of the job, and one person never holds two positions of the same job.
      if (!isActivePosition(lockedReq.data, positionIndex)) return null;
      if (await interpreterHoldsOtherPosition(tx, requestId, lockedReq, positionIndex, interpreterId)) return null;
      // Write from the locked snapshot, not the one read before the transaction: the other position may have changed since.
      const existingData = lockedReq.data as Record<string, any>;

      // Atomically claim the offer: only succeeds if it is still pending at write time
      const [targetOffer] = await tx
        .update(offers)
        .set({ status: "accepted", updatedAt: now, ...(answers ? offerAnswerColumns(answers) : {}) })
        .where(and(eq(offers.id, pendingOffer.id), eq(offers.status, "pending")))
        .returning();
      if (!targetOffer) return null;

      // Withdraw other pending offers specifically for this position
      const allReqOffers = await tx
        .select()
        .from(offers)
        .where(eq(offers.requestId, requestId));

      for (const off of allReqOffers) {
        const offPos = positionOfOfferIn(existingOfferPositions, off.id);
        if (off.id !== targetOffer.id && offPos === positionIndex && off.status === "pending") {
          await tx
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

      const newStatus = statusAfterBooking(
        staffingFacts({ ...existingData, offerPositions: updatedOfferPositions, slotReplacements: updatedSlotReplacements }, allReqOffers, { now, excludeOfferId: targetOffer.id }),
        positionIndex,
      );

      const updatedSlots = rebuildSlots({
        ids: readPositions(existingData).ids,
        existing: existingData.slots,
        replacements: updatedSlotReplacements,
        booking: { position: positionIndex, offerId: targetOffer.id, interpreterId, interpreterName },
      });

      // Update requests record parameter-safely linking the accepted interpreter
      await tx
        .update(requests)
        .set({
          status: newStatus,
          data: {
            ...existingData,
            offerPositions: updatedOfferPositions,
            slotReplacements: updatedSlotReplacements,
            slots: updatedSlots,
            // Positions 1 and 2 have their own fields; later positions keep their booking in the slot record.
            ...assignmentFields(positionIndex, interpreterId, interpreterName),
          // existingData is a loose Record, so the spread loses the typed `brief` / `intake` keys.
          } as unknown as RequestData,
          updatedAt: now,
        })
        .where(eq(requests.id, requestId));

        return targetOffer;
      });
      if (!claimed) return blockedCard();
      committed = "accepted";
      await logActivity({ requestId, interpreterId, audience: "shared", kind: "offer_accepted", message: `Offer accepted · booked for ${positionText}`, actorLabel: "Interpreter (email link)" });

      // Agency: in-app notification + email, with the job's reference, date and location.
      await alertAgency({ event: "offer_accepted", requestId, interpreterId, positionNumber: positionIndex, answers: claimed });
      // Booked: send the confirmation with the secure full-details link.
      await sendBookingConfirmation({ requestId, interpreterId, positionNumber: positionIndex });

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
          "You're locked in for this assignment. A confirmation email with a private link to the full job details (location, appointment notes and materials) is on its way.",
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
      // One transaction, same as accepting: all of the decline is recorded, or none of it.
      const declined = await db.transaction(async (tx) => {
      // Locked, fresh snapshot (see the accept branch): a decline must not undo the other position's booking.
      const lockedReq = await lockRequestForPosition(tx, requestId);
      if (!lockedReq) return null;
      const existingData = lockedReq.data as Record<string, any>;
      const [targetOffer] = await tx
        .update(offers)
        .set({ status: "declined", updatedAt: now })
        .where(and(eq(offers.id, pendingOffer.id), eq(offers.status, "pending")))
        .returning();
      if (!targetOffer) return null;

      // Also mark any other pending offers for this interpreter on this request as declined
      await tx
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
      const allReqOffers = await tx
        .select()
        .from(offers)
        .where(eq(offers.requestId, requestId));

      // No other live offer for THIS position means it still needs coverage: flagged "Needs replacement" instead of left a draft.
      const newStatus = statusAfterDecline(staffingFacts(existingData, allReqOffers, { now, excludeInterpreterId: interpreterId }), positionIndex);

      // 3. Explicitly reset slots and assigned interpreter fields for the declined position
      const currentSlots = existingData.slots || readPositions(existingData).ids.map((id) => ({ positionIndex: id, active: false, reservedBy: null, interpreterName: undefined }));

      const updatedSlots = currentSlots.map((s: any) => {
        // Only a slot that is empty or held by THIS interpreter is reset; another interpreter's booking is never touched.
        const ownsOrEmpty = !s.reservedBy || s.reservedBy === interpreterId;
        if ((s.positionIndex === positionIndex || (!s.positionIndex && positionIndex === 1)) && ownsOrEmpty) {
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

      // Same rule for the per-position name fields: clear them only if they are empty or this interpreter's.
      const ownerOfField = assignedInterpreterIdAt(existingData, positionIndex);
      if (!ownerOfField || ownerOfField === interpreterId) Object.assign(updatedData, clearedAssignmentFields(positionIndex));

      if (updatedData.overview) {
        updatedData.overview = {
          ...updatedData.overview,
          status: newStatus,
        };
      }

      // 4. Update the requests table explicitly clearing assigned interpreter and setting unfilled status
      await tx
        .update(requests)
        .set({
          status: newStatus,
          data: updatedData as RequestData,
          updatedAt: now,
        })
        .where(eq(requests.id, requestId));

        return targetOffer;
      });
      if (!declined) return blockedCard();
      committed = "declined";
      await logActivity({ requestId, interpreterId, kind: "offer_declined", message: `Offer declined (${positionText})`, actorLabel: "Interpreter (email link)" });

      await alertAgency({ event: "offer_declined", requestId, interpreterId, positionNumber: positionIndex });

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
        // Declined: no location at all.
        jobDetails: {
          title: jobTitle,
          date: jobDate,
          time: jobTime,
          position: roleLabel,
        },
      });
    }
  } catch (err) {
    logError("Offer Response", err);
    // The write already committed: the answer IS recorded, so don't tell the interpreter the link is expired.
    if (committed) {
      return renderHtmlCard({
        status: committed,
        title: committed === "accepted" ? "Offer Accepted!" : "Offer Declined",
        message:
          committed === "accepted"
            ? "Your acceptance is recorded. Your confirmation email may take a moment to arrive."
            : "Your response is recorded. Thank you for letting us know.",
      });
    }
    return expiredLinkCard();
  }
}

function expiredLinkCard(): Response {
  return renderHtmlCard({
    status: "expired",
    title: "Offer Expired or Invalid",
    message: "This link has expired or has already been used. Please reach out to the agency directly.",
  });
}

/**
 * Opening an Accept / Decline link (a GET) never changes anything. It shows a confirm page with the restricted job
 * summary, and the button on it POSTs the answer. This keeps mail scanners, link previews and double loads from
 * booking or declining by accident, and keeps the screen honest: what you see is what is in the database.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get("token");
  const action = searchParams.get("action")?.trim().toLowerCase();
  if (!token || (action !== "accept" && action !== "decline")) return expiredLinkCard();

  const payload = verifyOfferToken(token);
  if (!payload) return expiredLinkCard();

  try {
    const state = await resolveOfferLinkState(payload);
    if (state.kind === "pending") return renderOfferConfirmPage({ token, action, summary: state.summary, expiresAt: state.expiresAt });
    if (state.kind === "already_accepted" && action === "accept") {
      return renderHtmlCard({
        status: "accepted",
        title: "You're already booked",
        message: "This offer was already accepted, so there is nothing more to do. Your confirmation email has been sent.",
        jobDetails: { title: state.summary.offerPlace.headline, date: state.summary.dateLabel, time: state.summary.timeLabel, position: state.summary.role },
      });
    }
  } catch (err) {
    logError("Offer Response state", err);
  }
  return expiredLinkCard();
}

/** The confirm button. This is the only place an answer is recorded. */
export async function POST(request: NextRequest) {
  let token: string | null = null;
  let action: string | undefined;
  let form: FormData;
  try {
    form = await request.formData();
    const rawToken = form.get("token");
    token = typeof rawToken === "string" ? rawToken : null;
    action = String(form.get("action") ?? "").trim().toLowerCase();
  } catch {
    return expiredLinkCard();
  }
  if (action !== "accept") return processResponse(token, action, null);
  // Accepting needs the travel-time answer: a missing or bad one changes nothing, and the confirm page comes back with the problem.
  const answers = readAcceptAnswers(form);
  if (!answers.ok) return (token ? await confirmPageWithProblem(token, answers.error) : null) ?? expiredLinkCard();
  return processResponse(token, action, answers.answers);
}
