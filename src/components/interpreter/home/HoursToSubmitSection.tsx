import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { HoursDueLine } from "@/components/interpreter/HoursDueLine";
import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import type { Job } from "@/context/InterpreterJobsContext";
import { formatHomeJobDate } from "@/lib/interpreterHomeDates";
import { jobWhenParts } from "@/lib/interpreterJobDate";
import { jobPlaceLines } from "@/lib/jobPlaceLines";
import { ODHH_VERIFICATION_FORM_URL } from "@/lib/odhhPortal";
import { findOwnServiceRecord, getHoursBadgeInfo, getJobHoursState, showsStatePortal } from "@/utils/hoursState";
import { resolveRequestTimes } from "@/utils/timezone";

interface HoursToSubmitSectionProps {
  /** Past jobs that need hours, corrections first. Empty shows the "nothing to submit" card. */
  jobs: Job[];
  serviceRecords: Record<string, unknown>[];
  currentTime: number;
  profileTimezone: string;
}

const VIEW_IN_JOBS = "text-[13px] font-medium text-gray-600 hover:text-[var(--ink)] hover:underline shrink-0 whitespace-nowrap";

/** The "Hours to submit" card on the interpreter Home (a list, or a short note when there is nothing to submit). */
export function HoursToSubmitSection({ jobs, serviceRecords, currentTime, profileTimezone }: HoursToSubmitSectionProps) {
  if (jobs.length === 0) {
    return (
      <div id="hours-to-submit-section" className="bg-white rounded-2xl border border-gray-200 p-6 mt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0 border border-emerald-200">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Hours to submit</h2>
              <p className="text-[13px] text-[var(--sage)]">No past appointments need hours submitted right now.</p>
            </div>
          </div>
          <Link href="/jobs?tab=past&filter=needs_hours" className={VIEW_IN_JOBS}>View in jobs &rarr;</Link>
        </div>
      </div>
    );
  }

  return (
    <div id="hours-to-submit-section" className="bg-white rounded-2xl border border-amber-300/80 shadow-sm p-5 space-y-4 scroll-mt-6 mt-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 shrink-0 border border-amber-200">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-[var(--ink)]">Hours to submit ({jobs.length})</h2>
              {jobs.some((j) => getJobHoursState(j, serviceRecords) === "correction_requested") && (
                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Correction Needed
                </span>
              )}
            </div>
            <p className="text-[13px] text-[var(--sage)]">Past appointments and agency correction requests requiring your confirmed hours.</p>
          </div>
        </div>
        <Link href="/jobs?tab=past&filter=needs_hours" className={VIEW_IN_JOBS}>View in jobs &rarr;</Link>
      </div>

      <AnimatedPaginatedList
        items={jobs}
        itemsPerPage={5}
        className="space-y-2.5"
        getKey={(job) => job.id}
        renderItem={(job) => {
          const hoursState = getJobHoursState(job, serviceRecords);
          const badgeInfo = getHoursBadgeInfo(hoursState);
          const isCorrection = hoursState === "correction_requested";
          const place = jobPlaceLines(job);
          const locPrimary = place.primary || job.location;
          const locSecondary = place.secondary;
          const record = findOwnServiceRecord(serviceRecords, job);
          const reviewMsg = record?.reviewMessage || job.hoursSubmission?.reviewMessage;
          const when = jobWhenParts(job);

          return (
            <div
              key={job.id}
              className={`rounded-xl p-3 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border ${
                isCorrection ? "bg-amber-50/70 border-amber-300 ring-1 ring-amber-400/20" : "bg-[var(--canvas)] border-gray-200/80 hover:border-gray-300"
              }`}
            >
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex flex-row flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase">
                    {when.start ? formatHomeJobDate(profileTimezone, when.start, when.end, when.zone) : job.dateString}
                  </span>
                  <span className={`inline-flex h-6 items-center text-[11px] px-2.5 rounded-full whitespace-nowrap ${badgeInfo.badgeClass}`}>{badgeInfo.label}</span>
                </div>
                <h3 className="text-sm font-semibold text-[var(--ink)] truncate">{job.title}</h3>
                <div className="flex items-start gap-1.5 text-[13px] text-[var(--sage)]">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                  <span>{locPrimary}{locSecondary ? ` · ${locSecondary}` : ""}</span>
                </div>
                {!isCorrection && <HoursDueLine endsAt={resolveRequestTimes(job).endsAt} stateForm={showsStatePortal(job, hoursState)} nowMs={currentTime} />}
                {isCorrection && reviewMsg && (
                  <div className="mt-2 text-xs text-amber-900 bg-amber-100/90 rounded-lg p-2.5 border border-amber-200">
                    <span className="font-semibold">Agency review comment: </span>&quot;{reviewMsg}&quot;
                  </div>
                )}
              </div>

              <div className="shrink-0 w-full md:w-auto flex items-center justify-end">
                {showsStatePortal(job, hoursState) && !isCorrection ? (
                  <a
                    href={ODHH_VERIFICATION_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full md:w-auto text-xs font-semibold px-4 py-2 rounded-full transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm bg-[var(--forest-soft)] hover:bg-[var(--forest-deep)] text-white"
                  >
                    ODHH Verification Form →
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <Link
                    href={`/jobs/${job.id}`}
                    className={`w-full md:w-auto text-xs font-semibold px-4 py-2 rounded-full transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm ${
                      isCorrection ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-[var(--forest-soft)] hover:bg-[var(--forest-deep)] text-white"
                    }`}
                  >
                    {isCorrection ? "Fix & Resubmit Hours →" : hoursState === "draft" ? "Resume Draft →" : "Submit Hours →"}
                  </Link>
                )}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
