import { eq } from "drizzle-orm";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import type { SelectRequest } from "@/db/schema";
import { resolveRequestTimes } from "@/utils/timezone";

/** An offer as the loaders read it; the sweep only needs these fields (and changes status/state). */
export interface SweepOffer {
  id: string;
  requestId: string;
  status: string;
  state: string;
  expiresAt: Date;
}

interface LooseOffersData {
  offers?: Array<{ id?: string }>;
}

/**
 * Auto-expire pending offers whose appointment has passed OR whose response deadline has passed. The interpreter stays on the request
 * as an "Expired" offer (it is kept, not removed), so the agency can re-send quickly. Writes the new state to the database and updates
 * `allOffers` and `dbRows` in place, so what is shown straight after is what was saved. Nothing is read or written when no offer is
 * pending, which is the usual case. SERVER ONLY.
 */
export async function sweepExpiredOffers(dbRows: SelectRequest[], allOffers: SweepOffer[], now: Date): Promise<void> {
  if (!allOffers.some((off) => off.status === "pending" || off.state === "pending")) return;
  const rowById = new Map(dbRows.map((row) => [row.id, row]));
  for (const off of allOffers) {
    if (off.status === "pending" || off.state === "pending") {
      const parentRow = rowById.get(off.requestId);
      if (parentRow) {
        const { endsAt } = resolveRequestTimes(parentRow);
        const endsAtDate = new Date(endsAt);
        const deadlinePassed = Boolean(off.expiresAt) && new Date(off.expiresAt).getTime() <= now.getTime();
        if ((!isNaN(endsAtDate.getTime()) && now > endsAtDate) || deadlinePassed) {
          await db.update(offers)
            .set({ status: "expired", updatedAt: now })
            .where(eq(offers.id, off.id));
          off.status = "expired";
          off.state = "expired";

          const rowData = (parentRow.data ?? {}) as LooseOffersData;
          let modifiedData = false;
          if (Array.isArray(rowData.offers)) {
            rowData.offers = rowData.offers.map((o) =>
              o.id === off.id ? { ...o, status: "expired", state: "expired", expiredAt: now.toISOString() } : o
            );
            modifiedData = true;
          }

          if (parentRow.status === "Offer awaiting response") {
            const siblingOffers = allOffers.filter((o) => o.requestId === parentRow.id);
            const hasOtherPending = siblingOffers.some((o) => o.id !== off.id && (o.status === "pending" || o.state === "pending"));
            const hasAccepted = siblingOffers.some((o) => o.status === "accepted" || o.state === "accepted");
            if (!hasOtherPending) {
              const newStatus = hasAccepted ? "Partially staffed" : "Unfilled / draft";
              await db.update(requests)
                .set({
                  status: newStatus,
                  data: modifiedData ? (rowData as SelectRequest["data"]) : parentRow.data,
                  updatedAt: now,
                })
                .where(eq(requests.id, parentRow.id));
              parentRow.status = newStatus;
            } else if (modifiedData) {
              await db.update(requests)
                .set({ data: rowData as SelectRequest["data"], updatedAt: now })
                .where(eq(requests.id, parentRow.id));
            }
          } else if (modifiedData) {
            await db.update(requests)
              .set({ data: rowData as SelectRequest["data"], updatedAt: now })
              .where(eq(requests.id, parentRow.id));
          }
        }
      }
    }
  }
}
