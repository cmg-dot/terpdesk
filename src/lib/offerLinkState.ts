import { eq } from "drizzle-orm";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { summarizeJob } from "@/lib/jobSummary";
import type { JobSummary } from "@/lib/jobSummary";
import type { OfferTokenPayload } from "@/lib/jwt";

/**
 * What an Accept / Decline link means RIGHT NOW, read-only. Opening a link only ever calls this: nothing is written,
 * so a mail scanner or link preview that opens the link cannot book or decline anything. The decision is made by the
 * confirm button (a POST), which re-checks everything again before writing.
 *
 *  - blocked:          expired token (already rejected earlier), offer expired / replaced / withdrawn / declined,
 *                      request cancelled, or the position taken by someone else
 *  - already_accepted: this same offer was already accepted by this interpreter (a repeat visit)
 *  - pending:          still open and answerable; carries the restricted summary for the confirm page
 *
 * SERVER ONLY: queries the database.
 */
export type OfferLinkState =
  | { kind: "blocked" }
  | { kind: "already_accepted"; summary: JobSummary }
  | { kind: "pending"; summary: JobSummary };

export async function resolveOfferLinkState(payload: OfferTokenPayload, now: Date = new Date()): Promise<OfferLinkState> {
  const [request] = await db.select().from(requests).where(eq(requests.id, payload.requestId)).limit(1);
  if (!request) return { kind: "blocked" };
  const status = String(request.status || "").toLowerCase();
  if (status === "cancelled" || status === "canceled") return { kind: "blocked" };

  const position = payload.positionNumber === 2 ? 2 : 1;
  const positions = ((request.data ?? {}) as { offerPositions?: Record<string, number> }).offerPositions ?? {};
  const positionOf = (offerId: string): number => positions[offerId] || 1;
  const requestOffers = await db.select().from(offers).where(eq(offers.requestId, payload.requestId));
  const summary = summarizeJob(request, position);
  // A link bound to one offer only ever means that offer.
  const mine = requestOffers.filter(
    (o) => o.interpreterId === payload.interpreterId && positionOf(o.id) === position && (!payload.offerId || o.id === payload.offerId),
  );

  if (mine.some((o) => o.status === "accepted")) return { kind: "already_accepted", summary };

  const takenByOther = requestOffers.some(
    (o) => o.status === "accepted" && o.interpreterId !== payload.interpreterId && positionOf(o.id) === position,
  );
  if (takenByOther) return { kind: "blocked" };

  const open = mine.some((o) => o.status === "pending" && o.expiresAt.getTime() > now.getTime());
  return open ? { kind: "pending", summary } : { kind: "blocked" };
}
