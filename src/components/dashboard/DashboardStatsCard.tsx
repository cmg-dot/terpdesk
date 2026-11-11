import Link from "next/link";
import type { DashboardCounts } from "@/lib/dashboardSummary";

interface Stat {
  label: string;
  href: string;
  value: (counts: DashboardCounts) => number;
}

const STATS: readonly Stat[] = [
  { label: "APPOINTMENTS", href: "/requests", value: (c) => c.appointments },
  { label: "NEEDING COVERAGE", href: "/requests?filter=needing-coverage", value: (c) => c.needingCoverage },
  { label: "PENDING OFFERS", href: "/requests?filter=pending-offers", value: (c) => c.pendingOffers },
  { label: "STAFF FOLLOW-UP", href: "/requests?filter=staff-follow-up", value: (c) => c.staffFollowUp },
  { label: "NEEDS REPLACEMENT", href: "/requests?filter=needs-replacement", value: (c) => c.needsReplacement },
  { label: "HOURS AWAITING REVIEW", href: "/hours-review", value: (c) => c.hoursAwaitingReview },
];

/** The dark card of six figures. `counts` is null until the first read arrives (each figure shows a dash, never a made-up zero). */
export const DashboardStatsCard = ({ counts }: { counts: DashboardCounts | null }) => (
  <div className="rounded-2xl border border-gray-200 bg-[var(--forest)] p-8 text-white ">
    <p className="mb-8 text-xs font-medium text-[var(--sidebar-muted)]">Upcoming appointments and unresolved past appointments</p>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-6">
      {STATS.map((stat) => (
        <Link key={stat.label} href={stat.href} className="flex flex-col gap-2 text-left hover:opacity-75 transition-opacity cursor-pointer">
          <span className="text-[11px] font-semibold tracking-widest text-[var(--sidebar-muted)]">{stat.label}</span>
          <span className="text-[28px] font-medium leading-none">{counts ? stat.value(counts) : "—"}</span>
        </Link>
      ))}
    </div>
  </div>
);
