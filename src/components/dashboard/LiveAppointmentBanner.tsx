import Link from "next/link";
import { formatEventTime } from "@/components/dashboard/dashboardFormat";
import type { RequestListRow } from "@/lib/requestListRow";

/** The persistent "Live Appointment Status" banner: green with a link when appointments are in progress, quiet grey when none are. */
export const LiveAppointmentBanner = ({ jobs }: { jobs: readonly RequestListRow[] }) => {
  if (jobs.length === 0) {
    return (
      <div className="bg-[#F8F7F4] border border-[#EBE8DF] text-[var(--ink)] rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-stone-400"></span>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--sage)]">Live Appointment Status</span>
            </div>
            <p className="text-[14px] text-gray-600 font-medium">No active bookings right now</p>
          </div>
        </div>
      </div>
    );
  }

  const only = jobs.length === 1 ? jobs[0] : null;
  return (
    <div className="bg-gradient-to-r from-[#0F3830] via-[var(--forest-soft)] to-[#24544B] border border-emerald-500/50 text-white rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
        </span>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Live Appointment Status</span>
            <span className="bg-emerald-500/30 text-emerald-200 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-emerald-400/30">Happening now</span>
          </div>
          <p className="text-[15px] font-semibold text-white">{only ? only.title : `${jobs.length} active appointments in progress`}</p>
          {only ? (
            <p className="text-[13px] text-emerald-200/80 mt-0.5">
              {formatEventTime(only.startsAt, only.endsAt, only.timeZone)}
              {only.venue || only.location ? ` · ${only.venue || only.location}` : ""}
            </p>
          ) : (
            <p className="text-[13px] text-emerald-200/80 mt-0.5">{jobs.length} booked assignments are active right now across your agency roster.</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2.5 w-full sm:w-auto">
        <Link
          href={only ? `/requests/${only.id}` : `/requests?filter=happening-now`}
          className="w-full sm:w-auto inline-flex items-center justify-center bg-white text-[var(--forest-soft)] font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-emerald-50 transition-colors shadow-sm"
        >
          {only ? "Open active booking →" : "View live requests →"}
        </Link>
      </div>
    </div>
  );
};
