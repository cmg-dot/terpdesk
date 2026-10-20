import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";

/**
 * The requests (jobs) an interpreter is booked on. Two records can say so, and either counts:
 *  - an ACCEPTED offer for the request (the normal path, and what direct assignment creates), or
 *  - the request itself naming them as the assigned interpreter for position 1 or 2.
 * Canceled requests are left out. This is the bridge from a job on the interpreter's side to the request the agency
 * attached files to, and every prep-material check uses it so the Prep page, the Job view and file opening agree.
 *
 * SERVER ONLY: queries the database. `interpreterId` must be the session's own interpreter id.
 */
export async function bookedRequestIds(interpreterId: string): Promise<string[]> {
  const viaOffers = await db
    .select({ id: requests.id })
    .from(offers)
    .innerJoin(requests, eq(requests.id, offers.requestId))
    .where(and(eq(offers.interpreterId, interpreterId), eq(offers.status, "accepted"), isNull(requests.canceledAt)));

  const viaRequest = await db
    .select({ id: requests.id })
    .from(requests)
    .where(
      and(
        isNull(requests.canceledAt),
        or(
          sql`${requests.data}->>'assignedInterpreterId' = ${interpreterId}`,
          sql`${requests.data}->>'position2InterpreterId' = ${interpreterId}`,
        ),
      ),
    );

  return Array.from(new Set([...viaOffers, ...viaRequest].map((r) => r.id)));
}
