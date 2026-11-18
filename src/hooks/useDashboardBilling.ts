"use client";

import { fetchDashboardBilling } from "@/app/actions/getDashboardBilling";
import { useCachedAction } from "@/hooks/useCachedAction";
import { BILLING_ENABLED } from "@/lib/billing/enabled";
import type { DashboardBilling } from "@/lib/dashboardBilling";

/** Billing off here: no server call at all, just "no card". */
const noBilling = async (): Promise<DashboardBilling | null> => null;

export interface DashboardBillingState {
  /** The pay period facts; null when there is no card to show (billing off, or its tables not migrated); undefined until the first read. */
  billing: DashboardBilling | null | undefined;
  failed: boolean;
}

/** The dashboard's billing card data, shown from the cache at once on a return visit and re-read when the screen opens or regains focus. */
export function useDashboardBilling(): DashboardBillingState {
  const { data, error } = useCachedAction<DashboardBilling | null>("dashboard-billing", BILLING_ENABLED ? fetchDashboardBilling : noBilling);
  return { billing: data, failed: error && data === undefined };
}
