"use client";

export interface VirtualMeetingValues {
  platform: string;
  meetingLink: string;
  meetingId: string;
  passcode: string;
  virtualInstructions: string;
}

export type VirtualMeetingField = keyof VirtualMeetingValues;

/** Same platform choices as the Quick Edit modal on the request page. */
export const VIRTUAL_PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: "Zoom", label: "Zoom" },
  { value: "Microsoft Teams", label: "Microsoft Teams" },
  { value: "Google Meet", label: "Google Meet" },
  { value: "Webex", label: "Webex" },
  { value: "Virtual", label: "Other Virtual Platform" },
];

/** True when the "How will interpreting happen?" value includes a virtual part ("Virtual" or "Hybrid — … virtual"). */
export const isVirtualFormat = (format: string): boolean => format.toLowerCase().includes("virtual");

/**
 * "Virtual Meeting Details" for the main Edit Assignment page: Platform, Meeting Link / Join URL, Meeting ID,
 * Passcode / Access Code, and Virtual Instructions / Notes, in the same order and wording as the Quick Edit modal.
 */
export function VirtualMeetingFields({
  values,
  onChange,
  disabled = false,
  className = "",
}: {
  values: VirtualMeetingValues;
  onChange: (field: VirtualMeetingField, value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const input =
    "w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none disabled:opacity-60";
  // A stored platform that isn't one of the choices (e.g. typed in by an intake) stays selectable instead of vanishing.
  const knownPlatform = VIRTUAL_PLATFORM_OPTIONS.some((o) => o.value === values.platform);

  return (
    <div className={`p-4 bg-gray-50 rounded-xl border border-gray-200/60 space-y-3.5 ${className}`}>
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Virtual Meeting Details</h4>

      <div>
        <label htmlFor="vm-platform" className="block text-xs font-medium text-gray-700 mb-1">Platform</label>
        <select id="vm-platform" disabled={disabled} value={values.platform} onChange={(e) => onChange("platform", e.target.value)} className={input}>
          {!knownPlatform && values.platform && <option value={values.platform}>{values.platform}</option>}
          {VIRTUAL_PLATFORM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="vm-link" className="block text-xs font-medium text-gray-700 mb-1">Meeting Link / Join URL</label>
        <input
          id="vm-link"
          type="text"
          disabled={disabled}
          placeholder="https://zoom.us/j/..."
          value={values.meetingLink}
          onChange={(e) => onChange("meetingLink", e.target.value)}
          className={input}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="vm-id" className="block text-xs font-medium text-gray-700 mb-1">Meeting ID</label>
          <input
            id="vm-id"
            type="text"
            disabled={disabled}
            placeholder="e.g. 812 3456 7890"
            value={values.meetingId}
            onChange={(e) => onChange("meetingId", e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="vm-passcode" className="block text-xs font-medium text-gray-700 mb-1">Passcode / Access Code</label>
          <input
            id="vm-passcode"
            type="text"
            disabled={disabled}
            placeholder="e.g. 984210"
            value={values.passcode}
            onChange={(e) => onChange("passcode", e.target.value)}
            className={`${input} font-mono`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="vm-notes" className="block text-xs font-medium text-gray-700 mb-1">Virtual Instructions / Notes</label>
        <textarea
          id="vm-notes"
          rows={2}
          disabled={disabled}
          placeholder="e.g. Waiting room enabled, join 5 mins before start."
          value={values.virtualInstructions}
          onChange={(e) => onChange("virtualInstructions", e.target.value)}
          className={input}
        />
      </div>
    </div>
  );
}
