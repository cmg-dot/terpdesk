"use server";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mileageLegs, offers, requests } from "@/db/schema";
import { requireInterpreter } from "@/lib/auth/guards";
import { latestSheetsByRequest, resolveOwnHours } from "@/lib/ownHours";
import { roundMiles } from "@/lib/timesheetSchemas";
import { countedMilesOf } from "@/lib/mileageSummary";
import type { MileageEntry, MileageEntryStatus, MileageLegView } from "@/lib/mileageSummary";
import { getIanaZone, resolveRequestTimes } from "@/utils/timezone";

type JsonObject = Record<string, unknown>;

const asObject = (v: unknown): JsonObject => (v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : {});
const finiteOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const ENTRY_STATUSES: readonly string[] = ["awaiting_review", "approved", "correction_requested"];

/** Legs saved on the hours record itself (older submissions, and verifications that carry only a total). */
function legsFromRecord(value: unknown): MileageLegView[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const leg = asObject(raw);
    return {
      fromLabel: typeof leg.fromLabel === "string" ? leg.fromLabel : "",
      toLabel: typeof leg.toLabel === "string" ? leg.toLabel : "",
      miles: finiteOrNull(leg.miles) ?? 0,
      roundTrip: leg.roundTrip === true,
      countedMiles: finiteOrNull(leg.countedMiles) ?? undefined,
    };
  });
}

export interface InterpreterMileage {
  /** When the data was read (ISO). The page filters "last 30 / 90 days" against this, so a render is stable. */
  generatedAt: string;
  entries: MileageEntry[];
}

/**
 * The signed-in interpreter's own mileage, one entry per booked job where they have reported hours with miles. It reads
 * the same hours records the rest of the interpreter app uses (see resolveOwnHours), so an agency approval shows here
 * as soon as it is made. Itemised legs come from `mileage_legs` when saved, else from the hours record.
 */
export async function getInterpreterMileage(): Promise<InterpreterMileage> {
  const { interpreterId } = await requireInterpreter();

  const [bookings, sheets, legRows] = await Promise.all([
    db
      .select({ offerId: offers.id, requestId: requests.id, title: requests.title, createdAt: requests.createdAt, data: requests.data })
      .from(offers)
      .innerJoin(requests, eq(offers.requestId, requests.id))
      .where(and(eq(offers.interpreterId, interpreterId), eq(offers.status, "accepted"))),
    latestSheetsByRequest(interpreterId),
    db
      .select()
      .from(mileageLegs)
      .where(eq(mileageLegs.interpreterId, interpreterId))
      .orderBy(asc(mileageLegs.requestId), asc(mileageLegs.position)),
  ]);

  const legsByRequest = new Map<string, MileageLegView[]>();
  for (const leg of legRows) {
    const list = legsByRequest.get(leg.requestId) ?? [];
    list.push({
      fromLabel: leg.fromLabel,
      toLabel: leg.toLabel,
      miles: Number(leg.miles),
      roundTrip: leg.roundTrip,
      countedMiles: Number(leg.countedMiles),
    });
    legsByRequest.set(leg.requestId, list);
  }

  const entries: MileageEntry[] = [];
  for (const booking of bookings) {
    const data = asObject(booking.data);
    const { hoursSub } = resolveOwnHours({ rowData: data, offerId: booking.offerId, interpreterId, sheet: sheets.get(booking.requestId) });
    if (!hoursSub || typeof hoursSub.status !== "string" || !ENTRY_STATUSES.includes(hoursSub.status)) continue;

    const status = hoursSub.status as MileageEntryStatus;
    const reportedMiles = roundMiles(finiteOrNull(hoursSub.miles) ?? 0);
    const approvedMiles = status === "approved" ? finiteOrNull(hoursSub.approvedMileage) : null;
    if (reportedMiles === 0 && !approvedMiles) continue;

    const savedLegs = legsByRequest.get(booking.requestId) ?? [];
    const legs = savedLegs.length > 0 ? savedLegs : legsFromRecord(hoursSub.legs);
    const { startsAt } = resolveRequestTimes({ createdAt: booking.createdAt, data: booking.data });

    entries.push({
      requestId: booking.requestId,
      title: booking.title,
      startsAt,
      timeZone: getIanaZone(typeof asObject(data.details).timeZone === "string" ? (asObject(data.details).timeZone as string) : undefined),
      status,
      reportedMiles,
      approvedMiles: approvedMiles === null ? null : roundMiles(approvedMiles),
      adjustmentReason: typeof hoursSub.mileageAdjustmentReason === "string" && hoursSub.mileageAdjustmentReason ? hoursSub.mileageAdjustmentReason : null,
      mileageNote: typeof hoursSub.mileageNote === "string" ? hoursSub.mileageNote : "",
      // The list shows what each leg counts for; a record without it is worked out from miles and round trip.
      legs: legs.map((leg) => ({ ...leg, countedMiles: countedMilesOf(leg) })),
    });
  }

  return { generatedAt: new Date().toISOString(), entries };
}
