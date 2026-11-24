"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { PersonalJobForm } from "@/components/myWork/PersonalJobForm";
import { Reveal } from "@/components/myWork/Reveal";
import { hoursLabel, personalJobDateTile, personalJobFormValues, personalJobWhen } from "@/lib/personalJobs";
import type { PersonalJobView } from "@/lib/personalJobs";

interface PersonalJobRowProps {
  job: PersonalJobView;
  /** True while the job has not ended yet (it carries an "Upcoming" tag). */
  upcoming?: boolean;
  /** True while this card shows its edit form (the form opens inside the card, so the list never has to be left). */
  editing?: boolean;
  onEdit: (job: PersonalJobView) => void;
  onSaved: (job: PersonalJobView) => void;
  onCancelEdit: () => void;
  /** Resolves to an error message, or null when it was deleted. */
  onDelete: (job: PersonalJobView) => Promise<string | null>;
}

const CHIP = "inline-flex max-w-full items-center rounded-full border border-[var(--banner-edge)] bg-[var(--canvas)] px-2.5 py-0.5 text-[12px] text-[var(--sage)]";
const BUTTON = "min-h-11 rounded-full px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] disabled:opacity-50 sm:min-h-9";

/**
 * One personal job, in the style of a Website request card: the calendar block (month over day), the title (the label, else "Personal job"),
 * when it was, the pills (setting, hours worked, break, counted miles), and Edit with a two-step Delete. The buttons sit to the right on a
 * wide card and under the text, in line with it, on a narrow one.
 * Edit opens the form below the summary, inside the card.
 */
export function PersonalJobRow({ job, upcoming = false, editing = false, onEdit, onSaved, onCancelEdit, onDelete }: PersonalJobRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tile = personalJobDateTile(job);

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
    <div
      data-personal-job={job.id}
      data-upcoming={upcoming ? "true" : "false"}
      data-editing={editing ? "true" : "false"}
      role="listitem"
      className="rounded-2xl border border-[var(--banner-edge)] bg-white p-4 transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[0_10px_28px_-14px_rgb(var(--forest-rgb)_/_0.45)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
          <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--tint)] text-[var(--tint-ink)]" data-date-tile="">
            <span className="text-[10px] font-semibold uppercase leading-none tracking-wider">{tile.month}</span>
            <span className="mt-1 text-[20px] font-semibold leading-none">{tile.day}</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="min-w-0 break-words text-[16px] font-semibold text-[var(--ink)]">{job.label || "Personal job"}</h3>
              {upcoming && <span className="inline-flex items-center rounded-full bg-[var(--tint)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--tint-ink)]">Upcoming</span>}
            </div>
            <p className="mt-0.5 text-[13px] text-[var(--sage)]">{personalJobWhen(job)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {job.setting && <span className={CHIP}>{job.setting}</span>}
              <span className="inline-flex items-center rounded-full bg-[var(--tint)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--tint-ink)]">{hoursLabel(job.workedMinutes)} worked</span>
              {job.breakMinutes > 0 && <span className={CHIP}>{job.breakMinutes} min break</span>}
              {job.countedMiles !== null && (
                <span className={CHIP}>
                  {job.countedMiles.toFixed(1)} mi counted{job.roundTrip && job.miles !== null ? ` (${job.miles.toFixed(1)} each way)` : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {!editing && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[4.25rem] sm:pl-0">
            {confirming ? (
              <>
                <span className="text-[13px] text-[var(--sage)]">Delete this job?</span>
                <button type="button" onClick={remove} disabled={deleting} className={`${BUTTON} bg-red-600 text-white hover:bg-red-700`}>
                  {deleting ? "Deleting..." : "Yes, delete"}
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className={`${BUTTON} border border-[var(--banner-edge)] text-[var(--ink)] hover:bg-[var(--surface)]`}>
                  Keep
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onEdit(job)} className={`${BUTTON} border border-[var(--forest)] text-[var(--forest)] hover:bg-[var(--forest)] hover:text-[var(--canvas)]`}>
                  Edit
                </button>
                <button type="button" onClick={() => setConfirming(true)} className={`${BUTTON} border border-[var(--banner-edge)] text-red-700 hover:bg-red-50`}>
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <AnimatePresence initial={false}>
        {editing && (
          <Reveal key="edit">
            <div className="mt-4 border-t border-[var(--banner-edge)] pt-4">
              <PersonalJobForm embedded idPrefix={`pj-edit-${job.id}`} editingId={job.id} initial={personalJobFormValues(job)} onSaved={onSaved} onCancel={onCancelEdit} />
            </div>
          </Reveal>
        )}
      </AnimatePresence>
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
