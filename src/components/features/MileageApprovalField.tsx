"use client";

import { mileageDiffers } from "@/lib/timesheetSchemas";

/** True when the typed mileage is a valid number that differs from the reported mileage, so a reason is required. */
export const needsMileageReason = (reported: number, value: string): boolean => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 && mileageDiffers(n, reported);
};

interface MileageApprovalFieldProps {
  reported: number;
  value: string;
  onChange: (value: string) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  showValueError: boolean;
  showReasonError: boolean;
}

const inputClass =
  "bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow";

/** The agency's "mileage to approve" input. Changing it from the reported figure asks for the reason. */
export function MileageApprovalField({
  reported,
  value,
  onChange,
  reason,
  onReasonChange,
  showValueError,
  showReasonError,
}: MileageApprovalFieldProps) {
  const adjusting = needsMileageReason(reported, value);
  return (
    <div className="mb-5">
      <label className="block text-xs text-gray-600 mb-2" htmlFor="mileage-to-approve">
        Mileage to approve (reported: {reported.toFixed(1)} mi)
      </label>
      <input
        id="mileage-to-approve"
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full sm:w-[200px] ${inputClass}`}
      />
      {showValueError && <p className="text-[#C23B22] text-xs mt-1">Please enter a valid non-negative number.</p>}
      {adjusting && (
        <div className="mt-3">
          <label className="block text-xs text-gray-600 mb-2" htmlFor="mileage-adjustment-reason">
            Reason for the change (required, the interpreter will see it)
          </label>
          <textarea
            id="mileage-adjustment-reason"
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            className={`w-full resize-none ${inputClass}`}
          />
          {showReasonError && <p className="text-[#C23B22] text-xs mt-1">Say why the approved mileage differs from the reported mileage.</p>}
          <button
            type="button"
            onClick={() => onChange(reported.toFixed(1))}
            className="mt-1 text-xs font-medium text-[var(--forest)] hover:underline"
          >
            Use the reported mileage instead
          </button>
        </div>
      )}
    </div>
  );
}
