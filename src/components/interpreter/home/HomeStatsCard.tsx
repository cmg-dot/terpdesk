import Link from "next/link";

interface HomeStatsCardProps {
  upcomingAppointments: number;
  upcomingBookings: number;
  pendingOffers: number;
  /** Shown as 0 until it has loaded. */
  connectedAgencies: number;
  hoursToSubmit: number;
}

const LABEL = "text-[10px] font-semibold tracking-wider text-[var(--sidebar-muted)] mb-2 uppercase";
const VALUE = "text-[28px] font-medium tracking-tight text-white leading-none";

/** The "Current connected work" numbers on the interpreter Home. */
export function HomeStatsCard({ upcomingAppointments, upcomingBookings, pendingOffers, connectedAgencies, hoursToSubmit }: HomeStatsCardProps) {
  return (
    <div className="bg-[var(--forest-soft)] rounded-2xl border border-gray-200 p-6 text-white mt-8">
      <h2 className="text-[12px] font-medium text-[var(--sidebar-muted)] mb-6">Current connected work</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-6">
        <div className="flex flex-col">
          <span className={LABEL}>Upcoming appointments</span>
          <span className={VALUE}>{upcomingAppointments}</span>
        </div>

        <div className="flex flex-col border-l border-white/10 pl-4 md:border-l md:border-white/10 md:pl-4">
          <span className={LABEL}>Upcoming bookings</span>
          <span className={VALUE}>{upcomingBookings}</span>
        </div>

        <div className="flex flex-col md:border-l border-white/10 md:pl-4 pt-4 md:pt-0">
          <span className={LABEL}>Pending offers</span>
          <span className={VALUE}>{pendingOffers}</span>
        </div>

        <div className="flex flex-col border-l border-white/10 pl-4 md:border-l md:border-white/10 md:pl-4 pt-4 md:pt-0">
          <span className={LABEL}>Connected agencies</span>
          <span className={VALUE}>{connectedAgencies}</span>
        </div>
        <Link
          href="/jobs?tab=past&filter=needs_hours"
          className="flex flex-col border-l border-white/10 pl-4 -ml-4 mt-2 md:mt-0 pt-4 md:pt-0 group hover:opacity-90 transition-opacity cursor-pointer"
          title="View past jobs needing hours"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] font-semibold tracking-wider text-[var(--sidebar-muted)] group-hover:text-white transition-colors uppercase">
              Hours to submit
            </span>
            {hoursToSubmit > 0 && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={VALUE}>{hoursToSubmit}</span>
            {hoursToSubmit > 0 && (
              <span className="text-[11px] text-amber-300 font-medium group-hover:underline flex items-center">Action needed &rarr;</span>
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}
