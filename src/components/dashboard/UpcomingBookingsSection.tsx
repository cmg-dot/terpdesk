import Link from "next/link";
import { MapPin } from "lucide-react";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import { formatBookingDateLine, formatStatusBadge } from "@/components/dashboard/dashboardFormat";
import type { RequestListRow } from "@/lib/requestListRow";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";

interface Props {
  jobs: readonly RequestListRow[];
  /** How many of `jobs` are live right now. */
  liveCount: number;
  nowMs: number;
}

const CHIP = "text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full";

/** One upcoming booking: when, status, title, where and the chips. The organization is named once: in the venue line, or under it. */
const BookingCard = ({ job, nowMs }: { job: RequestListRow; nowMs: number }) => {
  const isHappening = isAppointmentHappeningNow(job, nowMs);
  const format = job.format || (job.isVirtual ? "Virtual" : "In person");
  const venue = job.location || job.venue || (String(format).toLowerCase().includes("virtual") ? "Virtual" : "Location pending");
  const org = job.requester.org;
  const orgIsInVenue = Boolean(org) && venue.toLowerCase().includes(String(org).toLowerCase());
  const badge = formatStatusBadge(job.status);
  return (
    <Link
      key={job.id}
      href={`/requests/${job.id}`}
      className={`block bg-white rounded-2xl border p-4 hover:shadow-md transition-all cursor-pointer ${isHappening ? "border-emerald-500/60 ring-2 ring-emerald-500/10 bg-emerald-50/20" : "border-gray-200"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-1">
        <div className="text-xs font-bold tracking-wider text-[var(--date-ink)] uppercase leading-6">{formatBookingDateLine(job.startsAt, job.endsAt, job.timeZone)}</div>
        <div className="flex flex-row flex-wrap items-center justify-end gap-2">
          {isHappening && <HappeningNowBadge size="sm" className="h-6" />}
          <div className={`inline-flex h-6 items-center text-xs font-medium px-2.5 rounded-full whitespace-nowrap shrink-0 text-[var(--tint-ink)] ${badge.toLowerCase().includes("partially") ? "bg-[var(--tint)]" : "bg-[var(--surface)]"}`}>
            {badge}
          </div>
        </div>
      </div>

      <h3 className="text-base font-semibold text-[var(--ink)] my-1.5 leading-snug">{job.title}</h3>

      <div className="flex items-start gap-2 mb-2.5">
        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
        <div className="text-[13px] leading-snug">
          <span className="text-[var(--ink)] block">{venue}</span>
          {org && !orgIsInVenue && <span className="text-[var(--sage)]">{org}</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <span className={CHIP}>{job.setting}</span>
        <span className={CHIP}>{format}</span>
      </div>
    </Link>
  );
};

/** "Upcoming bookings": the next staffed appointments, the live ones first. */
export const UpcomingBookingsSection = ({ jobs, liveCount, nowMs }: Props) => (
  <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4 px-2">
      <div className="flex items-center gap-3">
        <h2 className="text-[17px] font-semibold text-[var(--ink)]">Upcoming bookings</h2>
        {liveCount > 0 && (
          <span className="inline-flex h-6 items-center gap-1.5 px-2.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            {liveCount} active now
          </span>
        )}
      </div>
      <Link href="/calendar" className="-my-3 py-3 text-sm font-medium text-slate-600 hover:text-[var(--ink)] transition-colors whitespace-nowrap">Open calendar →</Link>
    </div>

    {jobs.length === 0 ? (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-sm text-[var(--sage)]">No upcoming bookings right now.</div>
    ) : (
      <AnimatedPaginatedList
        items={[...jobs]}
        itemsPerPage={6}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
        getKey={(job) => job.id}
        renderItem={(job) => <BookingCard job={job} nowMs={nowMs} />}
      />
    )}
  </section>
);
