"use client";

import { SignaturePad } from "@/components/ui/SignaturePad";
import type { DateFieldErrors } from "@/lib/timesheetErrors";

export interface MileageLeg {
  id: number;
  from: string;
  to: string;
  distance: number | string;
  type: "total" | "round_trip";
}

interface InterpreterSubmitFormProps {
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

  /** ODHH jobs only. */
  travelStart: string;
  travelEnd: string;
  onTravelStartChange: (value: string) => void;
  onTravelEndChange: (value: string) => void;
  serviceCompleted: string;
  onServiceCompletedChange: (value: string) => void;

  /** Shown when the service was not completed. Omit to hide the field (legacy portal). */
  cancellationReason?: string;
  onCancellationReasonChange?: (value: string) => void;

  /** Inline validation messages, rendered directly under the matching date input. */
  fieldErrors?: DateFieldErrors;
  /** Any other submit-time error; rendered just above the action buttons. */
  formError?: string | null;

  serviceTimeHours: string;

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
  onSubmit: () => void;
  /** Omit to hide the "Save draft" button (e.g. the zero-login form has no drafts). */
  onSaveDraft?: () => void;
  submitLabel?: string;
  submittingLabel?: string;
}

const input =
  "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed";
const legInput =
  "min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed";
const label = "block text-[13px] text-gray-600 mb-2";
const errorText = "text-xs text-red-700 mt-1";
const invalid = "border-red-400 focus:ring-red-500";

export const InterpreterSubmitForm = (p: InterpreterSubmitFormProps) => {
  const locked = p.isFutureAppointment;
  const twoCol = p.compact ? "grid grid-cols-1 gap-6 mb-6" : "grid grid-cols-1 md:grid-cols-2 gap-6 mb-6";
  const legRow = p.compact ? "flex flex-col gap-3 mb-3" : "flex flex-col md:flex-row md:items-center gap-3 mb-3";
  const m = (cls: string) => (p.compact ? "" : cls);
  const errs = p.fieldErrors ?? {};
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
          <label className={label}>Actual start</label>
          <input type="datetime-local" disabled={locked} value={p.actualStart} onChange={(e) => p.onActualStartChange(e.target.value)} aria-invalid={Boolean(errs.actualStart)} className={`${input} ${errs.actualStart ? invalid : ""}`} />
          {fieldError(errs.actualStart)}
          <p className="text-[11px] text-gray-500 mt-1">Times are in {p.timeZoneLabel}.</p>
        </div>
        <div>
          <label className={label}>Actual end</label>
          <input type="datetime-local" disabled={locked} value={p.actualEnd} onChange={(e) => p.onActualEndChange(e.target.value)} aria-invalid={Boolean(errs.actualEnd)} className={`${input} ${errs.actualEnd ? invalid : ""}`} />
          {fieldError(errs.actualEnd)}
        </div>
      </div>

      {p.isOdhh ? (
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
                    className="text-[var(--forest)] focus:ring-[#0B3B32] disabled:opacity-50"
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
        </>
      ) : (
        <div className="mb-6">
          <label className={label}>Unpaid break (in minutes)</label>
          <input type="number" min="0" disabled={locked} value={p.breakMinutes} onChange={(e) => p.onBreakMinutesChange(e.target.value)} className={input} />
        </div>
      )}

      <div className="mb-6">
        <p className="text-sm font-medium text-gray-800 mb-2">
          Service time before review: <span className="font-bold">{p.serviceTimeHours}</span>
        </p>
      </div>

      <div className="bg-white p-5 rounded-xl border border-gray-200 mb-6">
        <h4 className="text-sm font-medium text-[var(--ink)] mb-2">Mileage for this assignment</h4>
        <p className="text-xs text-[var(--sage)] mb-6">
          Enter either the one-way distance and add a return on the same route, or enter the total distance already travelled without adding a return. This records miles only — no reimbursement is calculated here, and not every assignment pays mileage.
        </p>

        {p.mileageLegs.map((leg) => {
          const dist = parseFloat(String(leg.distance)) || 0;
          const legTotal = leg.type === "round_trip" ? dist * 2 : dist;
          return (
            <div key={leg.id} className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
              <div className={legRow}>
                <input type="text" disabled={locked} placeholder="From" value={leg.from} onChange={(e) => p.onUpdateLeg(leg.id, "from", e.target.value)} className={`${legInput} w-full ${m("md:flex-1")}`} />
                <input type="text" disabled={locked} placeholder="To" value={leg.to} onChange={(e) => p.onUpdateLeg(leg.id, "to", e.target.value)} className={`${legInput} w-full ${m("md:flex-1")}`} />
                <input type="number" disabled={locked} placeholder="Distance" value={leg.distance} onChange={(e) => p.onUpdateLeg(leg.id, "distance", e.target.value)} className={`${legInput} w-full ${m("md:w-24 md:flex-none")}`} />
                <select disabled={locked} value={leg.type} onChange={(e) => p.onUpdateLeg(leg.id, "type", e.target.value)} className={`${legInput} w-full ${m("md:flex-[1.5]")} truncate`}>
                  <option value="total">Total distance already travelled</option>
                  <option value="round_trip">One-way distance + return on same route</option>
                </select>
                <button type="button" disabled={locked} onClick={() => p.onRemoveLeg(leg.id)} className={`text-sm font-medium text-gray-500 hover:text-red-600 self-end ${m("md:self-auto")} shrink-0 px-1 disabled:opacity-50 disabled:cursor-not-allowed`}>
                  Remove
                </button>
              </div>
              <p className="text-xs text-gray-600">
                Calculated total for this leg: <span className="font-semibold">{legTotal.toFixed(1)} mi</span> {legTotal === 0 ? "— no distance added" : ""}
              </p>
            </div>
          );
        })}

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <button type="button" disabled={locked} onClick={p.onAddLeg} className="bg-white border border-gray-300 text-gray-700 rounded-full px-4 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
            Add a travel leg
          </button>
          <span className="text-sm text-gray-700">Calculated total mileage: <span className="font-bold">{p.totalMileage.toFixed(1)} mi</span></span>
        </div>

        <div className="mb-4">
          <label className={label}>Mileage note (optional)</label>
          <textarea rows={2} disabled={locked} value={p.mileageNote} onChange={(e) => p.onMileageNoteChange(e.target.value)} className={input}></textarea>
        </div>
        <p className="text-xs text-[var(--sage)]">Automatic driving distance is not switched on. No mapping service is connected to this workspace yet, so nothing can be calculated from an address today.</p>
      </div>

      <div className="mb-6">
        <label className={label}>Service note (optional)</label>
        <textarea rows={3} disabled={locked} value={p.note} onChange={(e) => p.onNoteChange(e.target.value)} className={input}></textarea>
        <p className="text-xs text-[var(--sage)] mt-2">Keep this about timing only — start, end, breaks and waiting. Do not enter participant names, health details or anything said during the assignment.</p>
      </div>

      <div className="bg-white p-5 rounded-xl border border-gray-200 mb-6">
        <h4 className="text-sm font-medium text-[var(--ink)] mb-1">Signature</h4>
        <p className="text-xs text-[var(--sage)] mb-3">Sign below to confirm the hours you are reporting. A signature is required to submit.</p>
        <SignaturePad onChange={p.onSignatureChange} disabled={locked || p.isSubmitting} />
      </div>

      {p.formError && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          {p.formError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={p.onSubmit} disabled={p.isSubmitting || locked || !p.hasSignature} className="bg-[#1B433C] text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-[#14332D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {p.isSubmitting ? (p.submittingLabel ?? "Submitting...") : (p.submitLabel ?? "Submit actual hours")}
        </button>
        {p.onSaveDraft && (
          <button type="button" onClick={p.onSaveDraft} disabled={locked} className="bg-white border border-gray-300 text-gray-700 rounded-full px-5 py-2 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Save draft
          </button>
        )}
        {p.isOdhh && (
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
