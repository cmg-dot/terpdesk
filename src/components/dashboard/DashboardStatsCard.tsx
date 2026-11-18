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

/** The dark card of six figures, three across and two down. `counts` is null until the first read arrives (each figure shows a dash, never a made-up zero). */
export const DashboardStatsCard = ({ counts }: { counts: DashboardCounts | null }) => (
  <div className="rounded-2xl border border-gray-200 bg-[var(--stats)] p-6 text-white sm:p-7">
    <p className="mb-6 text-xs font-medium text-[var(--stats-label)]">Upcoming appointments and unresolved past appointments</p>
    {/* -mx-3 / -mb-3 cancel the links' own padding, so their text lines up with the line above and the card's padding below. */}
    <div className="-mx-3 -mb-3 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
      {STATS.map((stat) => (
        <Link
          key={stat.label}
          href={stat.href}
          className="flex flex-col gap-2 rounded-xl p-3 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <span className="text-xs font-semibold tracking-wider text-[var(--stats-label)]">{stat.label}</span>
          <span className="text-[28px] font-medium leading-none">{counts ? stat.value(counts) : "—"}</span>
        </Link>
      ))}
    </div>
  </div>
);
