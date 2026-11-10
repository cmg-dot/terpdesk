"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { positionOfOffer } from "@/lib/positions";
import { positionIdSchema } from "@/lib/validation/position";
import { getBaseUrl } from "@/lib/baseUrl";
import { createJobDetailsToken } from "@/lib/jobDetailsToken";
import { logError } from "@/lib/logError";
import { resolveRequestTimes } from "@/utils/timezone";

export type InterpreterPreviewLinkResult = { success: true; url: string } | { success: false; error: string };

const schema = z.object({ requestId: z.string().uuid(), positionIndex: positionIdSchema });

/**
 * Agency staff get the secure job-details link of the interpreter booked in a position, WITHOUT any email being sent, to open or
 * copy it (testing, or reading the job the way the interpreter sees it). It is the very link the booking confirmation carries
 * (signed, expires after the job, and switched off the moment the interpreter is no longer booked), so it only works for a
 * position that really has someone booked. Agency only; the audit trail records who made it for which job and interpreter,
 * never the link itself. Note: opening it shows the interpreter's page, including its "Request clarification" and "Give back"
 * buttons, which act as that interpreter.
 */
export async function getInterpreterPreviewLink(input: z.input<typeof schema>): Promise<InterpreterPreviewLinkResult> {
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
    const [request] = await db.select({ id: requests.id, status: requests.status, createdAt: requests.createdAt, data: requests.data }).from(requests).where(eq(requests.id, requestId)).limit(1);
    if (!request) return { success: false, error: "This request no longer exists." };
    if (["cancelled", "canceled"].includes(String(request.status || "").toLowerCase())) return { success: false, error: "This appointment was cancelled." };

    // The booked interpreter for this position = the accepted offer mapped to it (the same rule "Resend details" uses).
    const positions = ((request.data ?? {}) as { offerPositions?: Record<string, number> }).offerPositions ?? {};
    const accepted = await db
      .select({ id: offers.id, interpreterId: offers.interpreterId })
      .from(offers)
      .where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted")));
    const booked = accepted.find((o) => positionOfOffer(positions, o.id) === positionIndex);
    if (!booked) return { success: false, error: "No interpreter is booked in this position." };

    let endsAt = new Date(NaN);
    try {
      endsAt = new Date(resolveRequestTimes(request).endsAt);
    } catch {
      // The link then keeps its minimum lifetime.
    }
    const token = createJobDetailsToken({ requestId, interpreterId: booked.interpreterId }, endsAt);
    if (!token) return { success: false, error: "Secure links are not set up on this server." };

    await writeAuditLog({ userId: session.user.id, userEmail: session.user.email ?? null, action: "interpreter_link_created", details: `requestId=${requestId}; interpreterId=${booked.interpreterId}` });
    return { success: true, url: `${getBaseUrl()}/job-details?token=${encodeURIComponent(token)}` };
  } catch (err) {
    logError("getInterpreterPreviewLink", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
