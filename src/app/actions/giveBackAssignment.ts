"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInterpreter, NOT_ALLOWED_MESSAGE } from "@/lib/auth/guards";
import { giveBackBooking } from "@/lib/giveBack";
import type { GiveBackResult } from "@/lib/giveBack";
import { resolveJobDetailsLink } from "@/lib/jobDetailsAccess";
import { db } from "@/db";
import { offers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logError } from "@/lib/logError";

const reasonSchema = z.string().max(1000, "Please keep the reason under 1000 characters.");

const revalidate = (requestId: string) => {
  revalidatePath("/jobs");
  revalidatePath("/interpreter-home");
  revalidatePath("/dashboard");
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
};

/** In-app "Give back this assignment". Only the signed-in interpreter's own booking (session-scoped, never trusted ids). */
export async function giveBackAssignment(offerId: string, requestId: string, reason: string): Promise<GiveBackResult> {
  let interpreterId: string;
  try {
    ({ interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const ids = z.object({ offerId: z.string().uuid(), requestId: z.string().uuid() }).safeParse({ offerId, requestId });
  const why = reasonSchema.safeParse(reason ?? "");
  if (!ids.success) return { success: false, error: "This booking could not be found." };
  if (!why.success) return { success: false, error: why.error.issues[0]?.message ?? "Invalid reason." };

  try {
    const result = await giveBackBooking({ offerId: ids.data.offerId, interpreterId, reason: why.data, via: "app" });
    if (result.success) revalidate(ids.data.requestId);
    return result;
  } catch (err) {
    logError("giveBackAssignment", err);
    return { success: false, error: "We could not give back this assignment. Please try again or contact the agency." };
  }
}

/** "Give back assignment" from the secure job-details page: the signed link plus a live "still booked" check authorize it. */
export async function giveBackViaDetailsLink(input: { token: string; reason: string }): Promise<GiveBackResult> {
  const parsed = z.object({ token: z.string().min(1).max(2000), reason: reasonSchema }).safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  try {
    const access = await resolveJobDetailsLink(parsed.data.token);
    if (!access.ok) return { success: false, error: "This link is no longer valid, or you're no longer booked on this job." };
    // The link names the job and the interpreter, not the offer: give back that interpreter's own accepted offer.
    const [own] = await db
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.requestId, access.requestId), eq(offers.interpreterId, access.interpreterId), eq(offers.status, "accepted")))
      .limit(1);
    if (!own) return { success: false, error: "You're no longer booked on this job." };
    const result = await giveBackBooking({ offerId: own.id, interpreterId: access.interpreterId, reason: parsed.data.reason, via: "secure link" });
    if (result.success) revalidate(access.requestId);
    return result;
  } catch (err) {
    logError("giveBackViaDetailsLink", err);
    return { success: false, error: "We could not give back this assignment. Please try again or contact the agency." };
  }
}
