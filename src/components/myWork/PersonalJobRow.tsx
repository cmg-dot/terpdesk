"use client";

import { useState } from "react";
import { hoursLabel, personalJobWhen } from "@/lib/personalJobs";
import type { PersonalJobView } from "@/lib/personalJobs";

interface PersonalJobRowProps {
  job: PersonalJobView;
  onEdit: (job: PersonalJobView) => void;
  /** Resolves to an error message, or null when it was deleted. */
  onDelete: (job: PersonalJobView) => Promise<string | null>;
}

const chip = "rounded-full border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600";

/** One personal job in the list: when, the optional label, hours and miles, with Edit and a two-step Delete. */
export function PersonalJobRow({ job, onEdit, onDelete }: PersonalJobRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    const message = await onDelete(job);
    if (message) {
      setError(message);
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <li data-personal-job={job.id} role="listitem" className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--sage)]">{personalJobWhen(job)}</p>
          <h3 className="break-words text-base font-semibold text-[var(--ink)]">{job.label || "Personal job"}</h3>
          <div className="flex flex-wrap gap-1.5">
            {job.setting && <span className={chip}>{job.setting}</span>}
            <span className="rounded-full bg-[var(--tint)] px-2.5 py-0.5 text-xs font-medium text-[var(--tint-ink)]">{hoursLabel(job.workedMinutes)} worked</span>
            {job.breakMinutes > 0 && <span className={chip}>{job.breakMinutes} min break</span>}
            {job.countedMiles !== null && (
              <span className={chip}>
                {job.countedMiles.toFixed(1)} mi counted{job.roundTrip && job.miles !== null ? ` (${job.miles.toFixed(1)} each way)` : ""}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start">
          {confirming ? (
            <>
              <span className="text-[13px] text-[var(--sage)]">Delete this job?</span>
              <button type="button" onClick={remove} disabled={deleting} className="rounded-full bg-red-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className="rounded-full border border-gray-200 px-4 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                Keep
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => onEdit(job)} className="rounded-full border border-gray-200 px-4 py-1.5 text-[13px] font-medium text-gray-700 transition-colors hover:bg-[var(--surface)]">
                Edit
              </button>
              <button type="button" onClick={() => setConfirming(true)} className="rounded-full border border-gray-200 px-4 py-1.5 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-50">
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-800">
          {error}
        </p>
      )}
    </li>
  );
}
