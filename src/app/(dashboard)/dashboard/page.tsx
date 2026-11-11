"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
import { DashboardStatsCard } from "@/components/dashboard/DashboardStatsCard";
import { LiveAppointmentBanner } from "@/components/dashboard/LiveAppointmentBanner";
import { NeedsAttentionSection } from "@/components/dashboard/NeedsAttentionSection";
import { UpcomingBookingsSection } from "@/components/dashboard/UpcomingBookingsSection";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { buildDashboardLists } from "@/lib/dashboardLists";

const NO_JOBS: never[] = [];

export default function DashboardPage() {
  const { data: session } = useSession();
  const welcomeName = (session?.user?.displayName || session?.user?.name)?.trim();
  const { summary, failed } = useDashboardSummary();
  // The page's own clock decides what is live, upcoming or finished, so a job moves the minute it starts or ends; the six figures and
  // the jobs themselves come from the server (see fetchDashboardSummary).
  const nowMs = useMinuteClock();
  const lists = useMemo(() => buildDashboardLists(summary?.active ?? NO_JOBS, nowMs), [summary, nowMs]);

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto max-w-[1200px] space-y-10 pt-2">
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          <NeedsAttentionSection jobs={lists.needsAttention} laterCount={lists.needsAttentionLaterCount} />
          <UpcomingBookingsSection jobs={lists.upcoming} liveCount={lists.upcomingHappeningNowCount} nowMs={nowMs} />
        </div>

        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 border border-neutral-100/50 h-full max-h-[400px]">
            <h2 className="mb-4 text-[17px] font-semibold text-[var(--ink)]">Unavailable in this test workspace</h2>
            <p className="text-[15px] leading-relaxed text-[var(--sage)]">
              Billing, payments and integrations are unavailable. Notifications appear inside the app, and you can turn on optional email notices in Settings. Nothing is texted or pushed to your device.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
