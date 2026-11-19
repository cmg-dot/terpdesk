"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { CancellationFormPanel } from "@/components/interpreter/jobs/CancellationFormPanel";
import { CancellationPill } from "@/components/interpreter/jobs/CancellationPill";
import type { Job } from "@/context/InterpreterJobsContext";
import { jobDateLine } from "@/lib/interpreterJobDate";
import { ODHH_VERIFICATION_FORM_URL } from "@/lib/odhhPortal";

const BACK = "inline-flex items-center justify-center gap-2 text-[14px] font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-6 py-2.5 rounded-full transition-colors";

/**
 * The page for a job the agency cancelled. Where billing is off (production until sign-off) it is the plain notice it always was. Where
 * billing is on, it says whether the cancellation is billable, and a billable one opens the way to the cancellation form: the app's
 * hours form in cancellation mode, or, on a State job, the ODHH Verification Form (service not completed, with the cancellation as
 * the reason). The job's details stay withheld either way: only its title and date are shown.
 */
export function CancelledJobView({ job }: { job: Job }) {
  const verdict = job.cancellation ?? null;
  const billable = verdict?.billable === true;

  return (
    <div className="max-w-[1200px] mx-auto p-4 md:p-8 w-full pb-24 antialiased flex flex-col items-center justify-center pt-32">
      <div role="status" className={`bg-white rounded-2xl border border-gray-200 p-8 w-full ${billable && !job.isStateJob ? "max-w-2xl" : "max-w-md text-center"}`}>
        <div className={`mb-4 flex flex-col gap-2 ${billable && !job.isStateJob ? "items-start text-left" : "items-center"}`}>
          {verdict && <CancellationPill billable={billable} />}
          <h2 className="text-xl font-semibold text-[var(--ink)]">Appointment Cancelled</h2>
          {verdict && (
            <p className="text-[13px] text-[var(--sage)]">
              {job.title} · {jobDateLine(job)}
            </p>
          )}
        </div>

        {!verdict && <p className="text-[var(--sage)] mb-8">The agency cancelled this appointment. It has been removed from your upcoming jobs, and the job details are no longer available to you.</p>}

        {verdict && !billable && (
          <p className="text-[var(--sage)] mb-8">The agency cancelled this appointment with enough notice, so the cancellation is not billable and no form is needed. The job details are no longer available to you.</p>
        )}

        {billable && job.isStateJob && (
          <div className="mb-8 space-y-4">
            <p className="text-[var(--sage)]">The agency cancelled this appointment with short notice, so the cancellation is billable. Because this is a State job, report it on the ODHH Verification Form: mark the service as not completed and give the cancellation as the reason.</p>
            <a href={ODHH_VERIFICATION_FORM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[var(--forest-soft)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--forest-deep)]">
              ODHH Verification Form
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        )}

        {billable && !job.isStateJob && (
          <div className="mb-8 space-y-4">
            <p className="text-left text-[var(--sage)]">The agency cancelled this appointment with short notice, so the cancellation is billable. Tell the agency about any travel you had already started and add a note. The booked times are filled in, and no mileage is recorded.</p>
            <CancellationFormPanel job={job} />
          </div>
        )}

        <Link href="/interpreter-home" className={BACK}>
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
