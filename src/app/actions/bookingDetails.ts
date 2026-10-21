"use server";

import { and, count, eq, gt, like } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, offers, requests } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { sendBookingConfirmation } from "@/lib/jobEmails";
import { logError } from "@/lib/logError";

export type ResendDetailsResult = { success: true; message: string } | { success: false; error: string };

const schema = z.object({ requestId: z.string().uuid(), positionIndex: z.union([z.literal(1), z.literal(2)]) });
const COOLDOWN_MS = 2 * 60 * 1000;

/**
 * Agency "Resend details": sends the booked interpreter the booking confirmation again (safe summary plus the
 * private full-details link). Only for a position that is actually booked, and at most once every 2 minutes per
 * interpreter and job, so a repeated click can't flood their inbox.
 */
export async function resendBookingDetails(input: z.input<typeof schema>): Promise<ResendDetailsResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: "You don't have permission to do this." };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { requestId, positionIndex } = parsed.data;

  try {
    const [request] = await db.select({ status: requests.status, data: requests.data }).from(requests).where(eq(requests.id, requestId)).limit(1);
    if (!request) return { success: false, error: "This request no longer exists." };
    if (["cancelled", "canceled"].includes(String(request.status || "").toLowerCase())) {
      return { success: false, error: "This appointment was cancelled." };
    }

    // The booked interpreter for this position = the accepted offer mapped to it.
    const positions = ((request.data ?? {}) as { offerPositions?: Record<string, number> }).offerPositions ?? {};
    const accepted = await db
      .select({ id: offers.id, interpreterId: offers.interpreterId })
      .from(offers)
      .where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted")));
    const booked = accepted.find((o) => (positions[o.id] || 1) === positionIndex);
    if (!booked) return { success: false, error: "No interpreter is booked in this position." };

    const marker = `requestId=${requestId}; interpreterId=${booked.interpreterId}`;
    const [recent] = await db
      .select({ total: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "booking_details_resent"), like(auditLogs.details, `${marker}%`), gt(auditLogs.createdAt, new Date(Date.now() - COOLDOWN_MS))));
    if (Number(recent?.total ?? 0) > 0) return { success: false, error: "Details were just sent. Please wait a couple of minutes." };

    const sent = await sendBookingConfirmation({ requestId, interpreterId: booked.interpreterId, positionNumber: positionIndex });
    if (!sent) return { success: false, error: "We could not send the email. Check the interpreter's email address and try again." };

    await writeAuditLog({ userId: session.user.id, userEmail: session.user.email ?? null, action: "booking_details_resent", details: marker });
    return { success: true, message: "Booking details sent to the interpreter." };
  } catch (err) {
    logError("resendBookingDetails", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
