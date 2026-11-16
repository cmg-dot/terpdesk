"use server";

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { interpreters, offers, requests } from "@/db/schema";
import { requireInterpreter, NOT_ALLOWED_MESSAGE } from "@/lib/auth/guards";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { logError } from "@/lib/logError";
import { isActivePosition, positionCount, positionOfOffer, positionOrdinal } from "@/lib/positions";

export interface TeamContact {
  name: string;
  email: string;
  /** Their "Position N" on the job. */
  positionOrdinal: number;
}

export type TeamContactsResult = { success: true; team: TeamContact[] } | { success: false; error: string };

const isCancelled = (status: string, canceledAt: Date | null): boolean => Boolean(canceledAt) || /^cancel+ed$/i.test(status);

/**
 * The other interpreters booked on the signed-in interpreter's team job: name and roster email, so the team can coordinate.
 * Session-scoped: only for the caller's OWN accepted booking on a job that is not cancelled and has more than one position, and only
 * teammates whose booking is accepted on an active position. Nothing about the client or the job is returned; nothing is logged.
 */
export async function getMyTeamContacts(offerId: string): Promise<TeamContactsResult> {
  let interpreterId: string;
  try {
    ({ interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = z.string().uuid().safeParse(offerId);
  if (!parsed.success) return { success: false, error: "Unknown job." };

  try {
    const [own] = await db
      .select({ requestId: offers.requestId, status: requests.status, canceledAt: requests.canceledAt, data: requests.data })
      .from(offers)
      .innerJoin(requests, eq(requests.id, offers.requestId))
      .where(and(eq(offers.id, parsed.data), eq(offers.interpreterId, interpreterId), eq(offers.status, "accepted")))
      .limit(1);
    if (!own || isCancelled(own.status, own.canceledAt) || positionCount(own.data) < 2) return { success: true, team: [] };

    const offerPositions = (own.data as { offerPositions?: unknown }).offerPositions;
    const others = await db
      .select({ offerId: offers.id, interpreterId: offers.interpreterId, email: interpreters.email })
      .from(offers)
      .innerJoin(interpreters, eq(interpreters.id, offers.interpreterId))
      .where(and(eq(offers.requestId, own.requestId), eq(offers.status, "accepted"), ne(offers.interpreterId, interpreterId)));

    const team: TeamContact[] = [];
    for (const other of others) {
      const position = positionOfOffer(offerPositions, other.offerId);
      if (!isActivePosition(own.data, position)) continue;
      const name = (await getInterpreterDisplayName(other.interpreterId)) ?? "Team interpreter";
      team.push({ name, email: other.email, positionOrdinal: positionOrdinal(own.data, position) });
    }
    team.sort((a, b) => a.positionOrdinal - b.positionOrdinal);
    return { success: true, team };
  } catch (err) {
    logError("getMyTeamContacts", err);
    return { success: false, error: "We could not load your team for this job." };
  }
}
