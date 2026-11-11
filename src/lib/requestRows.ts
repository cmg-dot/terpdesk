import { desc, eq, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, offers, requests } from "@/db/schema";
import { ensureDisplayNameColumns, interpreterDisplayName } from "@/lib/displayName";
import { mapRequestRow } from "@/lib/mapRequestRow";
import type { MappedRequest } from "@/lib/mapRequestRow";
import { sweepExpiredOffers } from "@/lib/offerSweep";

/**
 * Every request with its offers, worked out by mapRequestRow. The two queries run together (one round trip's wait, not two), and
 * pending offers that ran out are expired first, so what comes back is what was saved. The agency-only guard belongs to the caller.
 *
 * `offerScope`: "all" returns every offer ever made (the full loader). "open" returns only pending and accepted offers: the only ones
 * that change a job's status, its staffing or its pending-offer flag, so lists and counts are identical and the offers read is smaller.
 * `requestFilter` limits which requests are read (the hours review reads only the ones it needs); the offers read is not narrowed, since
 * it is already small, so a request's status and staffing come out exactly as they do in the unfiltered read. SERVER ONLY.
 */
export async function loadRequestRows(offerScope: "all" | "open", requestFilter?: SQL): Promise<MappedRequest[]> {
  await ensureDisplayNameColumns();
  const [dbRows, allOffers] = await Promise.all([
    db.select().from(requests).where(requestFilter).orderBy(desc(requests.createdAt)),
    db
      .select({
        id: offers.id,
        requestId: offers.requestId,
        interpreterId: offers.interpreterId,
        interpreterName: interpreterDisplayName,
        state: offers.status,
        status: offers.status,
        expiresAt: offers.expiresAt,
        // When the offer last changed (sent, accepted, declined, expired): tells which answer is the latest.
        updatedAt: offers.updatedAt,
      })
      .from(offers)
      .leftJoin(interpreters, eq(offers.interpreterId, interpreters.id))
      .where(offerScope === "open" ? inArray(offers.status, ["pending", "accepted"]) : undefined),
  ]);

  await sweepExpiredOffers(dbRows, allOffers, new Date());

  const offersByRequest = new Map<string, typeof allOffers>();
  for (const offer of allOffers) {
    const list = offersByRequest.get(offer.requestId);
    if (list) list.push(offer);
    else offersByRequest.set(offer.requestId, [offer]);
  }
  return dbRows.map((row) => mapRequestRow(row, offersByRequest.get(row.id) ?? []));
}
