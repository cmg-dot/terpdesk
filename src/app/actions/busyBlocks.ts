"use server";

import { eq, inArray } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { busyBlocks, interpreterProfiles } from "@/db/schema";
import { ensureAvailabilityTables } from "@/lib/availability/ensureTables";
import { resolveInterpreterIds } from "@/lib/availability/ids";
import { assertOwnInterpreterId, requireRole } from "@/lib/auth/guards";
import { getIanaZone, wallClockToUtcDate } from "@/utils/timezone";

/**
 * Save a private busy block to PostgreSQL.
 * Strictly uses selected timeZone without browser offset distortion.
 * If isAllDay is true: forces starts_at to 00:00:00 of start date in selected timezone,
 * and ends_at to 00:00:00 of the day after the end date in selected timezone, then converts to UTC.
 */
export async function td_save_busy(params: {
  id?: string;
  interpreterId: string;
  title?: string;
  startsAt?: string | Date;
  endsAt?: string | Date;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timeZone?: string;
  isAllDay?: boolean;
  revision?: number;
}) {
  const ownSession = await requireRole("interpreter");
  assertOwnInterpreterId(ownSession, params.interpreterId);
  await ensureAvailabilityTables();
  const {
    id,
    interpreterId,
    title = "Busy",
    startsAt,
    endsAt,
    timeZone,
    isAllDay = false,
    revision = 1,
  } = params;

  const targetIds = await resolveInterpreterIds(interpreterId);
  const primaryId = targetIds[0] || interpreterId;

  let chosenZone = timeZone;
  if (!chosenZone) {
    const [profile] = await db
      .select({ timeZone: interpreterProfiles.timeZone })
      .from(interpreterProfiles)
      .where(inArray(interpreterProfiles.interpreterId, targetIds))
      .limit(1);
    chosenZone = profile?.timeZone || "America/Los_Angeles";
  }
  const safeZone = getIanaZone(chosenZone);

  let startUtc: Date;
  let endUtc: Date;

  if (isAllDay) {
    const startDateStr = (
      params.startDate ||
      (typeof startsAt === "string"
        ? startsAt.split("T")[0]
        : formatInTimeZone(startsAt || new Date(), safeZone, "yyyy-MM-dd"))
    ).trim();

    const rawEndDateStr = (
      params.endDate ||
      (typeof endsAt === "string"
        ? endsAt.split("T")[0]
        : endsAt
        ? formatInTimeZone(endsAt, safeZone, "yyyy-MM-dd")
        : startDateStr)
    ).trim();

    const effectiveEndDateStr = rawEndDateStr < startDateStr ? startDateStr : rawEndDateStr;

    // Force starts_at to 00:00:00 of the start date in chosen zone
    startUtc = wallClockToUtcDate({
      dateStr: startDateStr,
      timeStr: "00:00:00",
      timeZone: safeZone,
    });

    // Force ends_at to 00:00:00 of the day AFTER the end date in chosen zone
    const [ey, em, ed] = effectiveEndDateStr.split("-").map(Number);
    const dayAfterUtc = new Date(Date.UTC(ey, em - 1, ed + 1));
    const dayAfterStr = dayAfterUtc.toISOString().split("T")[0];

    endUtc = wallClockToUtcDate({
      dateStr: dayAfterStr,
      timeStr: "00:00:00",
      timeZone: safeZone,
    });
  } else {
    let sDate = params.startDate;
    let sTime = params.startTime;
    if (!sDate || !sTime) {
      if (typeof startsAt === "string") {
        const [dPart, tPart] = startsAt.split("T");
        sDate = sDate || dPart;
        sTime = sTime || (tPart ? tPart.replace("Z", "").slice(0, 5) : "09:00");
      } else if (startsAt instanceof Date) {
        sDate = sDate || formatInTimeZone(startsAt, safeZone, "yyyy-MM-dd");
        sTime = sTime || formatInTimeZone(startsAt, safeZone, "HH:mm");
      } else {
        sDate = new Date().toISOString().split("T")[0];
        sTime = "09:00";
      }
    }

    startUtc = wallClockToUtcDate({
      dateStr: sDate,
      timeStr: sTime,
      timeZone: safeZone,
    });

    let eDate = params.endDate;
    let eTime = params.endTime;
    if (!eDate || !eTime) {
      if (typeof endsAt === "string") {
        const [dPart, tPart] = endsAt.split("T");
        eDate = eDate || dPart;
        eTime = eTime || (tPart ? tPart.replace("Z", "").slice(0, 5) : "10:00");
      } else if (endsAt instanceof Date) {
        eDate = eDate || formatInTimeZone(endsAt, safeZone, "yyyy-MM-dd");
        eTime = eTime || formatInTimeZone(endsAt, safeZone, "HH:mm");
      } else {
        eDate = sDate;
        eTime = "10:00";
      }
    }

    endUtc = wallClockToUtcDate({
      dateStr: eDate,
      timeStr: eTime,
      timeZone: safeZone,
    });
  }

  const blockId = id || crypto.randomUUID();

  if (id) {
    const [existing] = await db
      .select()
      .from(busyBlocks)
      .where(eq(busyBlocks.id, id))
      .limit(1);

    if (existing) {
      await db
        .update(busyBlocks)
        .set({
          title,
          startsAt: startUtc,
          endsAt: endUtc,
          timeZone: safeZone,
          revision: (existing.revision || 1) + 1,
        })
        .where(eq(busyBlocks.id, id));

      revalidatePath("/interpreter-calendar");
      revalidatePath("/interpreter-home");
      return {
        id,
        interpreterId: primaryId,
        title,
        startsAt: startUtc.toISOString(),
        endsAt: endUtc.toISOString(),
        timeZone: safeZone,
      };
    }
  }

  await db.insert(busyBlocks).values({
    id: blockId,
    interpreterId: primaryId,
    title,
    startsAt: startUtc,
    endsAt: endUtc,
    timeZone: safeZone,
    revision,
  });

  revalidatePath("/interpreter-calendar");
  revalidatePath("/interpreter-home");
  return {
    id: blockId,
    interpreterId: primaryId,
    title,
    startsAt: startUtc.toISOString(),
    endsAt: endUtc.toISOString(),
    timeZone: safeZone,
  };
}

/**
 * Delete a private busy block.
 */
export async function td_delete_busy(busyId: string) {
  const ownSession = await requireRole("interpreter");
  const [busy] = await db.select({ interpreterId: busyBlocks.interpreterId }).from(busyBlocks).where(eq(busyBlocks.id, busyId)).limit(1);
  if (busy) assertOwnInterpreterId(ownSession, busy.interpreterId);
  await ensureAvailabilityTables();
  await db.delete(busyBlocks).where(eq(busyBlocks.id, busyId));
  revalidatePath("/interpreter-calendar");
  revalidatePath("/interpreter-home");
  return { success: true };
}
