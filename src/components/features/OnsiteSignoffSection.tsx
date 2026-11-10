"use client";

import { SignaturePad } from "@/components/ui/SignaturePad";

export interface OnsiteSignoffSectionProps {
  printedName: string;
  onPrintedNameChange: (value: string) => void;
  onSignatureChange: (dataUrl: string | null) => void;
}

/**
 * "Authorized by": the facility contact who was on site confirms the hours on the interpreter's screen. Shown only for a
 * job that needs it (non-state, sign-off switched on); the server checks that again when the hours are submitted.
 */
export const OnsiteSignoffSection = ({ printedName, onPrintedNameChange, onSignatureChange, disabled = false }: OnsiteSignoffSectionProps & { disabled?: boolean }) => (
  <div className="bg-white p-5 rounded-xl border border-gray-200 mb-6" data-testid="onsite-signoff">
    <h4 className="text-sm font-medium text-[var(--ink)] mb-1">On-site authorization</h4>
    <p className="text-xs text-[var(--sage)] mb-4">
      Hand this device to the contact who was on site. They print their name and sign to authorize the hours above. Both are required to submit.
    </p>
    <label htmlFor="onsite-printed-name" className="block text-[13px] text-gray-600 mb-2">
      Authorized by (printed name)
    </label>
    <input
      id="onsite-printed-name"
      type="text"
      autoComplete="off"
      maxLength={100}
      disabled={disabled}
      value={printedName}
      onChange={(e) => onPrintedNameChange(e.target.value)}
      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--forest)] disabled:bg-gray-100 disabled:text-gray-400"
    />
    <SignaturePad onChange={onSignatureChange} disabled={disabled} label="On-site contact signature drawing area" />
  </div>
);
