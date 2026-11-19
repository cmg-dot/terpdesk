import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, offers, requests } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { BILLING_ENABLED } from "@/lib/billing/enabled";
import { loadBillingSetup } from "@/lib/billing/store";
import { BOOKING_CANCELLED } from "@/lib/cancelJob";
import { closedJobKind } from "@/lib/closedJob";
import { DEFAULT_CANCELLATION_RULES, cancellationOf } from "@/lib/interpreterCancellation";
import type { CancellationRules } from "@/lib/interpreterCancellation";

/**
 * Who may file a cancellation form. Decided HERE, from the database, never from anything the browser sends: the form is for an
 * interpreter whose own booking the agency cancelled (not voided, not returned), when billing is switched on and the cancellation is
 * billable (billing's rule, or staff's override). SERVER ONLY.
 */

/** The agency's notice rule and holidays when billing is set up; the standard ones when it is not (production until 0013). Never throws. */
export async function loadCancellationRules(): Promise<CancellationRules> {
  try {
    const setup = await loadBillingSetup(DEFAULT_AGENCY_ID);
    return setup.ready ? { settings: setup.settings, holidays: setup.holidays.map((h) => h.date) } : DEFAULT_CANCELLATION_RULES;
  } catch {
    return DEFAULT_CANCELLATION_RULES;
  }
}

export interface BillableCancelledBooking {
  /** The interpreter's own (cancelled) offer: it places them on their position of the job. */
  offerId: string;
  /** From the interpreters table, so the record never carries a name the browser typed. */
  interpreterName: string;
}

/** The interpreter's cancelled booking on `requestId` when a cancellation form may be filed for it, else null. */
export async function findBillableCancelledBooking(requestId: string, interpreterId: string): Promise<BillableCancelledBooking | null> {
  if (!BILLING_ENABLED) return null;
  const [row] = await db
    .select({
      offerId: offers.id,
      name: interpreters.name,
      status: requests.status,
      canceledAt: requests.canceledAt,
      billingStatus: requests.billingStatus,
      createdAt: requests.createdAt,
      data: requests.data,
    })
    .from(offers)
    .innerJoin(requests, eq(offers.requestId, requests.id))
    .innerJoin(interpreters, eq(interpreters.id, offers.interpreterId))
    .where(and(eq(offers.requestId, requestId), eq(offers.interpreterId, interpreterId), eq(offers.status, BOOKING_CANCELLED)))
    .limit(1);
  if (!row || closedJobKind(row) !== "cancelled") return null;
  return cancellationOf(row, await loadCancellationRules()).billable ? { offerId: row.offerId, interpreterName: row.name } : null;
}
