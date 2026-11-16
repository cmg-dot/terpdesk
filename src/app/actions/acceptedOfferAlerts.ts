"use server";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { logError } from "@/lib/logError";
import { isActivePosition, positionCount, positionOfOffer } from "@/lib/positions";
import type { AcceptedOfferAlert } from "@/lib/acceptedOfferAlert";
import { requestReference, srnOf } from "@/utils/statusEngine";

const MAX_ALERTS = 10;

/**
 * Bookings staff have not looked at yet (an interpreter accepted an offer): newest first, for the agency's top action banner. A job
 * that has since been cancelled is left out. Agency staff only; empty on error.
 */
export async function getAcceptedOfferAlerts(): Promise<AcceptedOfferAlert[]> {
  try {
    await requireRole("agency");
  } catch {
    return [];
  }
  try {
    const rows = await db
      .select({
        offerId: offers.id, requestId: offers.requestId, interpreterId: offers.interpreterId,
        travelRequested: offers.travelRequested, travelMinutes: offers.travelMinutes, availabilityNote: offers.availabilityNote,
        status: requests.status, canceledAt: requests.canceledAt, data: requests.data,
      })
      .from(offers)
      .innerJoin(requests, eq(requests.id, offers.requestId))
      .where(and(eq(offers.status, "accepted"), isNull(offers.agencyAcknowledgedAt)))
      .orderBy(desc(offers.updatedAt))
      .limit(MAX_ALERTS);
    const live = rows.filter((r) => !r.canceledAt && !/^cancel+ed$/i.test(r.status));
    if (live.length === 0) return [];

    const requestIds = Array.from(new Set(live.map((r) => r.requestId)));
    const booked = await db.select({ id: offers.id, requestId: offers.requestId }).from(offers).where(and(inArray(offers.requestId, requestIds), eq(offers.status, "accepted")));

    const alerts: AcceptedOfferAlert[] = [];
    for (const r of live) {
      const offerPositions = (r.data as { offerPositions?: unknown }).offerPositions;
      const filled = new Set(booked.filter((b) => b.requestId === r.requestId).map((b) => positionOfOffer(offerPositions, b.id)).filter((p) => isActivePosition(r.data, p)));
      alerts.push({
        offerId: r.offerId,
        requestId: r.requestId,
        interpreterName: (await getInterpreterDisplayName(r.interpreterId)) ?? "An interpreter",
        reference: requestReference(srnOf(r.data), r.requestId),
        travelRequested: r.travelRequested,
        travelMinutes: r.travelMinutes,
        availabilityNote: r.availabilityNote,
        openPositions: Math.max(0, positionCount(r.data) - filled.size),
      });
    }
    return alerts;
  } catch (err) {
    logError("getAcceptedOfferAlerts", err);
    return [];
  }
}

/** Dismisses the banner for the given accepted offers (one, or all shown). Agency staff only. */
export async function acknowledgeAcceptedOffers(offerIdsInput: string[]): Promise<{ success: boolean }> {
  try {
    await requireRole("agency");
  } catch {
    return { success: false };
  }
  const parsed = z.array(z.string().uuid()).min(1).max(MAX_ALERTS).safeParse(offerIdsInput);
  if (!parsed.success) return { success: false };
  try {
    await db.update(offers).set({ agencyAcknowledgedAt: new Date() }).where(and(inArray(offers.id, parsed.data), eq(offers.status, "accepted")));
    return { success: true };
  } catch (err) {
    logError("acknowledgeAcceptedOffers", err);
    return { success: false };
  }
}
