"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Job } from "@/context/InterpreterJobsContext";
import type { ServiceRecord } from "@/hooks/useServiceRecords";
import { HoursDueLine } from "@/components/interpreter/HoursDueLine";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
import { jobDateLine } from "@/lib/interpreterJobDate";
import { jobPlaceLines } from "@/lib/jobPlaceLines";
import { ODHH_VERIFICATION_FORM_URL } from "@/lib/odhhPortal";
import { settingLabel } from "@/lib/settingLabel";
import { resolveRequestTimes } from "@/utils/timezone";
import { findOwnServiceRecord, getJobHoursState, showsStatePortal } from "@/utils/hoursState";
import type { HoursWorkflowState } from "@/utils/hoursState";

const PILL = "inline-flex h-6 items-center text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0";

const HOURS_PILL: Record<HoursWorkflowState, { label: string; className: string }> = {
  not_submitted: { label: "Submit actual hours", className: "bg-[#F6EFE9] text-[#78350F] border border-[#EADBCE]" },
  draft: { label: "Submit actual hours", className: "bg-[#F6EFE9] text-[#78350F] border border-[#EADBCE]" },
  correction_requested: { label: "Changes requested", className: "bg-amber-100 text-amber-900 border border-amber-300 font-semibold" },
  awaiting_review: { label: "Submitted", className: "bg-purple-100 text-purple-800" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800" },
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** One booking whose time has passed, with where its hours stand and the button to submit or view them. */
export function CompletedJobCard({ job, serviceRecords }: { job: Job; serviceRecords: ServiceRecord[] }) {
  const { primary, secondary } = jobPlaceLines(job);
  const hoursState = getJobHoursState(job, serviceRecords);
  const isCorrection = hoursState === "correction_requested";
  const usesStatePortal = showsStatePortal(job, hoursState);
  const reviewMsg = text(findOwnServiceRecord(serviceRecords, job)?.reviewMessage) || text(job.hoursSubmission?.reviewMessage);
  const needsHours = hoursState === "not_submitted" || hoursState === "draft" || isCorrection;
  const pill = usesStatePortal ? { label: "Hours via ODHH portal", className: "bg-gray-100 text-gray-600 border border-gray-200" } : HOURS_PILL[hoursState];

  return (
    <div className={`bg-white rounded-2xl border p-4 flex flex-col justify-between hover:shadow-md transition-shadow ${isCorrection ? "border-amber-300 ring-1 ring-amber-300/30" : "border-gray-200"}`}>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-1">
          <div className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase leading-6">{jobDateLine(job)}</div>
          <div className="flex flex-row flex-wrap items-center justify-end gap-2">
            <span className={`${PILL} bg-[#DCEAE3] text-[var(--forest-soft)]`}>Completed</span>
            <span className={`${PILL} ${pill.className}`}>{pill.label}</span>
          </div>
        </div>
        <h3 className="text-base font-bold text-[var(--ink)] my-1.5 leading-snug">{job.title}</h3>
        <div className="flex items-start gap-2 mb-2">
          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
          <div className="text-[13px] leading-snug">
            <span className="text-[var(--ink)] block font-normal">{primary || "Location pending"}</span>
            <span className="text-[var(--sage)] text-[13px]">{secondary || job.agencyName || DEFAULT_AGENCY_NAME}</span>
          </div>
        </div>
        {needsHours && !isCorrection && <div className="mb-2"><HoursDueLine endsAt={resolveRequestTimes(job).endsAt} stateForm={usesStatePortal} /></div>}
        {isCorrection && reviewMsg && (
          <div className="mb-2.5 text-xs text-amber-900 bg-amber-50 rounded-lg p-2.5 border border-amber-200">
            <span className="font-semibold">Agency correction request: </span>&ldquo;{reviewMsg}&rdquo;
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 my-2.5">
          <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full bg-white">{settingLabel(job.setting, job.details?.setting)}</span>
          <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full bg-white">{job.isVirtual ? "Virtual" : "In person"}</span>
        </div>
      </div>
      {usesStatePortal ? (
        <a
          href={ODHH_VERIFICATION_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full mt-1 py-2 rounded-full text-center text-sm font-semibold text-[#1C3F36] border border-[#1C3F36] bg-white hover:bg-gray-50 transition-colors block"
        >
          Submit via ODHH Portal
        </a>
      ) : (
        <Link href={`/jobs/${job.id}`} className="w-full mt-1 py-2 rounded-full text-center text-sm font-semibold text-white bg-[#1C3F36] hover:bg-[#153029] transition-colors block shadow-sm">
          {needsHours ? "Submit actual hours" : "View reported hours"}
        </Link>
      )}
    </div>
  );
}
