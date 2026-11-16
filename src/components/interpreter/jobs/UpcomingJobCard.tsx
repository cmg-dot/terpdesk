"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Job } from "@/context/InterpreterJobsContext";
import type { ServiceRecord } from "@/hooks/useServiceRecords";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { UpdatedBadge } from "@/components/jobDetails/UpdatedBadge";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
import { jobDateLine } from "@/lib/interpreterJobDate";
import { jobPlaceLines } from "@/lib/jobPlaceLines";
import { settingLabel } from "@/lib/settingLabel";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";
import { getHoursBadgeInfo, getJobHoursState } from "@/utils/hoursState";

const PILL = "inline-flex h-6 items-center text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0";

/** One live offer or upcoming booking on the interpreter's Jobs page. */
export function UpcomingJobCard({ job, now, serviceRecords }: { job: Job; now: number; serviceRecords: ServiceRecord[] }) {
  const isOffer = job.status === "pending";
  // "Facility · Room" over the street address, on an offer as on a booking (lib/jobPlaceLines.ts).
  const { primary, secondary } = jobPlaceLines(job);
  const locPrimary = primary || (job.isVirtual ? "Virtual" : "Location pending");
  const locSecondary = secondary || (job.isVirtual ? "Remote / Video" : job.agencyName || DEFAULT_AGENCY_NAME);
  const isHappening = isAppointmentHappeningNow(job, now);
  const hoursState = getJobHoursState(job, serviceRecords);
  const badgeInfo = getHoursBadgeInfo(hoursState);
  const ring = isHappening ? "border-emerald-500/60 ring-2 ring-emerald-500/10" : hoursState === "correction_requested" ? "border-amber-300 ring-1 ring-amber-300/30" : "border-gray-200";

  return (
    <Link href={`/jobs/${job.id}`} className={`block bg-white rounded-2xl border p-4 hover:shadow-md transition-all ${ring}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-1">
        <div className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase leading-6">{jobDateLine(job)}</div>
        <div className="flex flex-row flex-wrap items-center justify-end gap-2">
          {isHappening && <HappeningNowBadge size="sm" className="h-6" />}
          {isOffer && <span className={`${PILL} bg-[#F5F3FF] text-[#6D28D9]`}>Offer received</span>}
          {job.status === "booked" && <span className={`${PILL} bg-[var(--surface)] text-[var(--forest-soft)]`}>Booked</span>}
          {job.status === "booked" && <UpdatedBadge update={job.detailsUpdated} endsAt={job.endsAt} />}
          {hoursState === "correction_requested" && <span className={`${PILL} ${badgeInfo.badgeClass}`}>{badgeInfo.label}</span>}
          {job.hasAutoFill && <span className={`${PILL} bg-[#FCE8E6] text-[#A0522D]`}>Auto Fill</span>}
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
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full">{settingLabel(job.setting, job.details?.setting)}</span>
        <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full">
          {job.isVirtual ? "Virtual" : job.format || job.details?.format || "In person"}
        </span>
      </div>
    </Link>
  );
}
