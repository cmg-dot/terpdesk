"use server";

import { formatInTimeZone } from "date-fns-tz";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { requireRole } from "@/lib/auth/guards";
import { BUSINESS_ZONE } from "@/lib/billing/businessCalendar";
import { BILLING_ENABLED } from "@/lib/billing/enabled";
import { loadBillingSetup } from "@/lib/billing/store";
import { dashboardBillingOf } from "@/lib/dashboardBilling";
import type { DashboardBilling } from "@/lib/dashboardBilling";

/**
 * The dashboard's billing card: the pay period /billing opens on, with its cutoff and pay date. Agency only; read only; no input, and
 * scoped to the agency's own settings. Dates only, never money or anyone's details. Null when billing is switched off here or its
 * tables are not on this database yet (production until 0013_billing.sql is applied), so the dashboard simply shows no card.
 */
export async function fetchDashboardBilling(): Promise<DashboardBilling | null> {
  await requireRole("agency");
  if (!BILLING_ENABLED) return null;
  const setup = await loadBillingSetup(DEFAULT_AGENCY_ID);
  if (!setup.ready) return null;
  const now = new Date();
  return dashboardBillingOf(setup.periods, formatInTimeZone(now, BUSINESS_ZONE, "yyyy-MM-dd"), now.getTime());
}
