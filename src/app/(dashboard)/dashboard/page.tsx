"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
import { BillingPeriodCard } from "@/components/dashboard/BillingPeriodCard";
import { DashboardStatsCard } from "@/components/dashboard/DashboardStatsCard";
import { LiveAppointmentBanner } from "@/components/dashboard/LiveAppointmentBanner";
import { NeedsAttentionSection } from "@/components/dashboard/NeedsAttentionSection";
import { UpcomingBookingsSection } from "@/components/dashboard/UpcomingBookingsSection";
import { useDashboardBilling } from "@/hooks/useDashboardBilling";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { BILLING_ENABLED } from "@/lib/billing/enabled";
import { dashboardViewOf } from "@/lib/dashboardView";

export default function DashboardPage() {
  const { data: session } = useSession();
  const welcomeName = (session?.user?.displayName || session?.user?.name)?.trim();
  const { summary, failed } = useDashboardSummary();
  // The page's own clock decides what is live, upcoming or finished, so a job moves the minute it starts or ends; the six figures and
  // the few jobs listed come from the server (see fetchDashboardSummary).
  const nowMs = useMinuteClock();
  const lists = useMemo(() => dashboardViewOf(summary, nowMs), [summary, nowMs]);
  // The billing card: only where billing is on, and only if this database can answer (null = tables not migrated: no card, full width).
  const { billing, failed: billingFailed } = useDashboardBilling();
  const showBillingCard = BILLING_ENABLED && billing !== null;

  return (
    <motion.div initial={summary ? false : { opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto max-w-[1200px] space-y-10 pt-2">
      <LiveAppointmentBanner jobs={lists.happeningNow} />

      <div className="space-y-6">
        <div className="space-y-1.5 w-full">
          <label className="pl-5 text-[13px] font-medium text-[var(--sage)]">Agency</label>
          <div className="rounded-full bg-[#F3F2EE] px-6 py-3.5 text-[15px] text-slate-600 border border-neutral-200/50">{DEFAULT_AGENCY_NAME}</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 md:gap-0">
        <div className="space-y-2">
          <h1 className="text-[32px] font-semibold tracking-tight text-[var(--ink)]">{welcomeName ? `Welcome, ${welcomeName}` : "Welcome"}</h1>
          <p className="text-[15px] text-[var(--sage)]">Your scheduling desk. Appointments and coverage saved across authorized accounts.</p>
        </div>
        <Link href="/requests/new" className="inline-block rounded-full bg-[var(--forest)] px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.5)]">
          New request
        </Link>
      </div>

      {failed && <p role="alert" className="text-sm text-red-700">We could not load your dashboard figures. They will be tried again in a moment.</p>}
      <DashboardStatsCard counts={summary?.counts ?? null} />

      {/* With the billing card: the two lists stacked beside it. Without it: the lists share the full width, side by side from xl up. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className={showBillingCard ? "space-y-8 lg:col-span-2" : "space-y-8 lg:col-span-3 xl:grid xl:grid-cols-2 xl:items-start xl:gap-8 xl:space-y-0"}>
          <NeedsAttentionSection jobs={lists.needsAttention} total={lists.needsAttentionTotal} laterCount={lists.needsAttentionLaterCount} />
          <UpcomingBookingsSection jobs={lists.upcoming} liveCount={lists.upcomingHappeningNowCount} nowMs={nowMs} />
        </div>

        {showBillingCard && (
          <div className="lg:col-span-1">
            <BillingPeriodCard billing={billing ?? undefined} failed={billingFailed} hoursAwaitingReview={summary?.counts.hoursAwaitingReview ?? null} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
