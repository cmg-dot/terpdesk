"use client";

import { FormField, cardClass, inputClass, sectionTitleClass } from "@/components/requests/form/formStyles";

interface Props {
  isPublic: boolean;
  isMixedGroup: boolean;
  requestedInterpreter: string;
  onChange: (field: "isPublic" | "isMixedGroup" | "requestedInterpreter", value: boolean | string) => void;
}

const Toggle = ({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (next: boolean) => void }) => (
  <div className="flex items-center gap-3">
    <input id={id} type="checkbox" className="h-5 w-5 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <label htmlFor={id} className="text-[15px] text-gray-700 font-medium cursor-pointer">{label}</label>
  </div>
);

/** The state form's Public and Mixed Group answers and its "Specific Interpreter Requested" (drives the roster badge). */
export function RequestFlagsCard({ isPublic, isMixedGroup, requestedInterpreter, onChange }: Props) {
  return (
    <div className={cardClass} data-form-card="request-flags">
      <h2 className={sectionTitleClass}>Request details</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Toggle id="request-public" label="Public" checked={isPublic} onChange={(next) => onChange("isPublic", next)} />
        <Toggle id="request-mixed-group" label="Mixed group" checked={isMixedGroup} onChange={(next) => onChange("isMixedGroup", next)} />
      </div>
      <FormField
        label="Specific interpreter requested"
        htmlFor="request-requested-interpreter"
        subtext="A preference to honour, not a booking. It shows as a badge on the request so staff can book that interpreter in one click. Optional."
      >
        <input id="request-requested-interpreter" type="text" maxLength={120} className={inputClass} value={requestedInterpreter} onChange={(e) => onChange("requestedInterpreter", e.target.value)} />
      </FormField>
    </div>
  );
}
