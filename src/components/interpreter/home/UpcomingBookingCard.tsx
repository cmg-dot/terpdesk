import Link from "next/link";
import { MapPin } from "lucide-react";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { UpdatedBadge } from "@/components/jobDetails/UpdatedBadge";
import type { Job } from "@/context/InterpreterJobsContext";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
import { formatHomeJobDate } from "@/lib/interpreterHomeDates";
import { jobWhenParts } from "@/lib/interpreterJobDate";
import { jobPlaceLines } from "@/lib/jobPlaceLines";
import { settingLabel } from "@/lib/settingLabel";

/** A job's `details.setting` / `details.format` when the server sent them as text, else "". */
const detailText = (job: object, key: "setting" | "format"): string => {
  const value = (job as { details?: Record<string, unknown> | null }).details?.[key];
  return typeof value === "string" ? value : "";
};

interface UpcomingBookingCardProps {
  job: Job;
  isHappening: boolean;
  profileTimezone: string;
}

/** One booked job in "Upcoming bookings" on the interpreter Home. */
export function UpcomingBookingCard({ job, isHappening, profileTimezone }: UpcomingBookingCardProps) {
  const place = jobPlaceLines(job);
  const locPrimary = place.primary || (job.isVirtual ? "Virtual" : "Location pending");
  const locSecondary = place.secondary || (job.isVirtual ? "Remote / Video" : (job.agencyName || DEFAULT_AGENCY_NAME));
  const when = jobWhenParts(job);

  return (
    <Link
      href={`/jobs/${job.id}`}
      className={`block bg-white rounded-2xl border p-4 hover:shadow-md transition-all ${isHappening ? "border-emerald-500/60 ring-2 ring-emerald-500/10" : "border-gray-200"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-1">
        <div className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase leading-6">
          {when.start ? formatHomeJobDate(profileTimezone, when.start, when.end, when.zone) : job.dateString}
        </div>
        <div className="flex flex-row flex-wrap items-center justify-end gap-2">
          {isHappening && <HappeningNowBadge size="sm" className="h-6" />}
          <div className="inline-flex h-6 items-center bg-[var(--surface)] text-[var(--forest-soft)] text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0">
            Booked
          </div>
          <UpdatedBadge update={job.detailsUpdated} endsAt={job.endsAt} />
          {job.hasAutoFill && (
            <div className="inline-flex h-6 items-center bg-[#FCE8E6] text-[#A0522D] text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0">
              Auto Fill
            </div>
          )}
        </div>
      </div>
      <h3 className="text-base font-semibold text-[var(--ink)] my-1.5 leading-snug">{job.title}</h3>
      <div className="flex items-start gap-2 mb-2.5">
        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
        <div className="text-[13px] leading-snug">
          <span className="text-[var(--ink)] block">{locPrimary}</span>
          <span className="text-[var(--sage)]">{locSecondary}</span>
        </div>
      </div>

      {job.hasAutoFill && (
        <p className="text-xs text-[var(--sage)] mb-2.5">
          Booked by {locSecondary?.split("(")[0]?.trim()} using your Auto Fill permission.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full">
          {settingLabel(job.setting, detailText(job, "setting"))}
        </span>
        <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full">
          {job.isVirtual ? "Virtual" : (job.format || detailText(job, "format") || "In person")}
        </span>
        {job.positionIndex && (
          <span className="text-xs font-medium text-[var(--forest-soft)] bg-[var(--surface)] px-2.5 py-0.5 rounded-full">
            {(job.positionCount ?? 1) > 1 ? `Team · Position ${job.positionOrdinal ?? job.positionIndex} of ${job.positionCount}` : `Position ${job.positionOrdinal ?? job.positionIndex}`}
          </span>
        )}
      </div>
    </Link>
  );
}
