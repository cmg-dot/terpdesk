"use client";

import { TriangleAlert } from "lucide-react";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { formatHoursMinutes } from "@/lib/durationFormat";
import { minutesOverSchedule, overtimeNeedsNote, overtimeWarning } from "@/lib/scheduledOvertime";
import { MileageLegsSection } from "@/components/features/MileageLegsSection";
import type { MileageLeg } from "@/components/features/MileageLegsSection";
import { OnsiteSignoffSection } from "@/components/features/OnsiteSignoffSection";
import type { OnsiteSignoffSectionProps } from "@/components/features/OnsiteSignoffSection";
import { FIELD_INPUT as input, FIELD_LABEL as label } from "@/components/features/submitFormStyles";
import type { DateFieldErrors } from "@/lib/timesheetErrors";

export type { MileageLeg } from "@/components/features/MileageLegsSection";

interface InterpreterSubmitFormProps {
  /**
   * "cancellation": the form for a booking the agency cancelled with a billable outcome. The booked times are shown read-only (nothing
   * was worked); travel, a cancellation note and the signature are asked; break, mileage and the on-site sign-off are not. The server
   * enforces all of it (submitInterpreterHours.ts), whatever this form sends.
   */
  mode?: "hours" | "cancellation";
  isFutureAppointment: boolean;
  isSubmitting: boolean;
  isOdhh: boolean;
  timeZoneLabel: string;
  odhhPortalUrl: string;

  actualStart: string;
  actualEnd: string;
  onActualStartChange: (value: string) => void;
  onActualEndChange: (value: string) => void;

  /** Private jobs only. */
  breakMinutes: string;
  onBreakMinutesChange: (value: string) => void;

  /** ODHH jobs only (and every job in cancellation mode). */
  travelStart: string;
  travelEnd: string;
  onTravelStartChange: (value: string) => void;
  onTravelEndChange: (value: string) => void;
  serviceCompleted: string;
  onServiceCompletedChange: (value: string) => void;

  /** Shown when the service was not completed (and always, as the cancellation note, in cancellation mode). Omit to hide the field (legacy portal). */
  cancellationReason?: string;
  onCancellationReasonChange?: (value: string) => void;

  /** Inline validation messages, rendered directly under the matching date input. */
  fieldErrors?: DateFieldErrors;
  /** Any other submit-time error; rendered just above the action buttons. */
  formError?: string | null;

  serviceTimeHours: string;
  /** The entered time (less the break) and the job's current scheduled length, in minutes: overtime gets a warning and needs a note. */
  workedMinutes?: number;
  scheduledMinutes?: number;

  mileageLegs: MileageLeg[];
  totalMileage: number;
  onAddLeg: () => void;
  onRemoveLeg: (id: number) => void;
  onUpdateLeg: (id: number, field: keyof MileageLeg, value: string) => void;
  mileageNote: string;
  onMileageNoteChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;

  /** Single-column layout for narrow containers (the md: breakpoints follow the viewport). */
  compact?: boolean;

  hasSignature: boolean;
  onSignatureChange: (dataUrl: string | null) => void;
  /** Set only for a job that needs the on-site contact's sign-off (non-state, switched on); `complete` is name + signature both filled in. */
  onsite?: OnsiteSignoffSectionProps & { complete: boolean };
  onSubmit: () => void;
  /** Omit to hide the "Save draft" button (e.g. the zero-login form has no drafts). */
  onSaveDraft?: () => void;
  submitLabel?: string;
  submittingLabel?: string;
}

const errorText = "text-xs text-red-700 mt-1";
const invalid = "border-red-400 focus:ring-red-500";

export const InterpreterSubmitForm = (p: InterpreterSubmitFormProps) => {
  const cancellation = p.mode === "cancellation";
  const locked = p.isFutureAppointment;
  // The booked times of a cancelled appointment are never edited.
  const timesLocked = locked || cancellation;
  const showTravel = p.isOdhh || cancellation;
  const twoCol = p.compact ? "grid grid-cols-1 gap-6 mb-6" : "grid grid-cols-1 md:grid-cols-2 gap-6 mb-6";
  const errs = p.fieldErrors ?? {};
  const overMinutes = cancellation || p.workedMinutes === undefined || p.scheduledMinutes === undefined ? 0 : minutesOverSchedule(p.workedMinutes, p.scheduledMinutes);
  const noteMissing = overtimeNeedsNote(overMinutes, p.note);
  const fieldError = (text?: string) =>
    text ? (
      <p className={errorText} role="alert">
        {text}
      </p>
    ) : null;

  return (
    <>
      <div className={twoCol}>
        <div>
          <label className={label}>{cancellation ? "Scheduled start" : "Actual start"}</label>
          <input type="datetime-local" disabled={timesLocked} value={p.actualStart} onChange={(e) => p.onActualStartChange(e.target.value)} aria-invalid={Boolean(errs.actualStart)} className={`${input} ${errs.actualStart ? invalid : ""}`} />
          {fieldError(errs.actualStart)}
          <p className="text-[11px] text-gray-500 mt-1">Times are in {p.timeZoneLabel}.{cancellation ? " These are the booked times: nothing was worked." : ""}</p>
        </div>
        <div>
          <label className={label}>{cancellation ? "Scheduled end" : "Actual end"}</label>
          <input type="datetime-local" disabled={timesLocked} value={p.actualEnd} onChange={(e) => p.onActualEndChange(e.target.value)} aria-invalid={Boolean(errs.actualEnd)} className={`${input} ${errs.actualEnd ? invalid : ""}`} />
          {fieldError(errs.actualEnd)}
        </div>
      </div>

      {showTravel ? (
        <>
          <div className={twoCol}>
            <div>
              <label className={label}>Travel start</label>
              <input type="datetime-local" disabled={locked} value={p.travelStart} onChange={(e) => p.onTravelStartChange(e.target.value)} aria-invalid={Boolean(errs.travelStart)} className={`${input} ${errs.travelStart ? invalid : ""}`} />
          {fieldError(errs.travelStart)}
            </div>
            <div>
              <label className={label}>Travel end</label>
              <input type="datetime-local" disabled={locked} value={p.travelEnd} onChange={(e) => p.onTravelEndChange(e.target.value)} aria-invalid={Boolean(errs.travelEnd)} className={`${input} ${errs.travelEnd ? invalid : ""}`} />
          {fieldError(errs.travelEnd)}
            </div>
          </div>
          {cancellation && <p className="-mt-3 mb-6 text-[12px] text-[var(--sage)]">Only if you had already started travelling when the appointment was cancelled. Leave both empty if not.</p>}

          {cancellation ? (
            <div className="mb-6">
              <label className={label}>Cancellation note</label>
              <textarea rows={2} maxLength={1000} disabled={locked} value={p.cancellationReason ?? ""} onChange={(e) => p.onCancellationReasonChange?.(e.target.value)} className={input}></textarea>
            </div>
          ) : (
            <div className="bg-white p-5 rounded-xl border border-gray-200 mb-6">
              <h4 className="text-sm font-medium text-[var(--ink)] mb-2">Verification</h4>
              <p className="text-xs text-[var(--sage)] mb-4">Was this service completed?</p>
              <div className="flex gap-4">
                {(["yes", "no"] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      disabled={locked}
                      value={value}
                      checked={p.serviceCompleted === value}
                      onChange={(e) => p.onServiceCompletedChange(e.target.value)}
                      className="text-[var(--forest)] focus:ring-[var(--forest)] disabled:opacity-50"
                    />
                    {value === "yes" ? "Yes" : "No"}
                  </label>
                ))}
              </div>
              {p.serviceCompleted === "no" && p.onCancellationReasonChange && (
                <div className="mt-4">
                  <label className={label}>Cancellation reason</label>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    disabled={locked}
                    value={p.cancellationReason ?? ""}
                    onChange={(e) => p.onCancellationReasonChange?.(e.target.value)}
                    className={input}
                  ></textarea>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mb-6">
          <label className={label}>Unpaid break (in minutes)</label>
          <input type="number" min="0" disabled={locked} value={p.breakMinutes} onChange={(e) => p.onBreakMinutesChange(e.target.value)} className={input} />
        </div>
      )}

      {!cancellation && (
        <>
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-800 mb-2">
              Service time before review: <span className="font-bold">{p.serviceTimeHours}</span>
            </p>
            {overMinutes > 0 && (
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-overtime-warning="">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <span>{overtimeWarning(overMinutes, formatHoursMinutes(p.scheduledMinutes ?? 0))}</span>
              </p>
            )}
          </div>

          <MileageLegsSection
            legs={p.mileageLegs}
            total={p.totalMileage}
            onAdd={p.onAddLeg}
            onRemove={p.onRemoveLeg}
            onUpdate={p.onUpdateLeg}
            note={p.mileageNote}
            onNoteChange={p.onMileageNoteChange}
            locked={locked}
            compact={p.compact}
          />
        </>
      )}

      <div className="mb-6">
        <label className={label}>Service note (optional)</label>
        <textarea rows={3} disabled={locked} value={p.note} onChange={(e) => p.onNoteChange(e.target.value)} className={input}></textarea>
        <p className="text-xs text-[var(--sage)] mt-2">Keep this about timing only: start, end, breaks and waiting. Do not enter participant names, health details or anything said during the assignment.</p>
      </div>

      <div className="bg-white p-5 rounded-xl border border-gray-200 mb-6">
        <h4 className="text-sm font-medium text-[var(--ink)] mb-1">Signature</h4>
        <p className="text-xs text-[var(--sage)] mb-3">Sign below to confirm the {cancellation ? "information you are reporting" : "hours you are reporting"}. A signature is required to submit.</p>
        <SignaturePad onChange={p.onSignatureChange} disabled={locked || p.isSubmitting} label="Interpreter signature drawing area" />
      </div>

      {p.onsite && !cancellation && <OnsiteSignoffSection {...p.onsite} disabled={locked || p.isSubmitting} />}

      {p.formError && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          {p.formError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={p.onSubmit} disabled={p.isSubmitting || locked || !p.hasSignature || noteMissing || (p.onsite !== undefined && !cancellation && !p.onsite.complete)} className="bg-[var(--forest-soft)] text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-[var(--forest-deep)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {p.isSubmitting ? (p.submittingLabel ?? "Submitting...") : (p.submitLabel ?? (cancellation ? "Submit cancellation form" : "Submit actual hours"))}
        </button>
        {p.onSaveDraft && !cancellation && (
          <button type="button" onClick={p.onSaveDraft} disabled={locked} className="bg-white border border-gray-300 text-gray-700 rounded-full px-5 py-2 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Save draft
          </button>
        )}
        {p.isOdhh && !cancellation && (
          <a
            href={p.odhhPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white border border-gray-300 text-[var(--forest)] rounded-full px-5 py-2 text-sm font-medium hover:bg-gray-50 transition-colors sm:ml-auto"
          >
            Open ODHH Portal
          </a>
        )}
      </div>
    </>
  );
};
