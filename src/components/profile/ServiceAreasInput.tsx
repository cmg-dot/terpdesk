"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { X } from "lucide-react";
import { inputClass } from "@/components/profile/formParts";
import { VIRTUAL_ONLY_AREA, cleanAreas, isVirtualOnlyLabel } from "@/lib/serviceAreas";

interface ServiceAreasInputProps {
  /** Must match the id the surrounding <Field> was given, so its label points at the text box. */
  id: string;
  value: string[];
  onChange: (areas: string[]) => void;
  error?: string;
}

const chip = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium";

/**
 * Tag input for service areas: type an area and press Enter (or comma) to add it, click the x to remove it. "Virtual Only"
 * is its own toggle and stands alone: choosing it replaces any areas, and while it is on no area can be added.
 */
export const ServiceAreasInput = ({ id, value, onChange, error }: ServiceAreasInputProps) => {
  const [draft, setDraft] = useState("");
  const virtualOnly = value.includes(VIRTUAL_ONLY_AREA);

  const addDraft = () => {
    const parts = draft.split(/[,;\n]+/);
    setDraft("");
    if (parts.some(isVirtualOnlyLabel)) onChange([VIRTUAL_ONLY_AREA]);
    else if (parts.some((p) => p.trim())) onChange(cleanAreas([...value, ...parts]));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      // Enter must not submit the profile form.
      e.preventDefault();
      addDraft();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        aria-pressed={virtualOnly}
        onClick={() => onChange(virtualOnly ? [] : [VIRTUAL_ONLY_AREA])}
        className={`${chip} transition-colors ${
          virtualOnly ? "border-blue-300 bg-blue-50 text-blue-700" : "border-stone-300 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        {virtualOnly ? "✓ " : ""}
        {VIRTUAL_ONLY_AREA}
      </button>

      {value.length > 0 && !virtualOnly && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Your service areas">
          {value.map((area) => (
            <li key={area} className={`${chip} border-stone-200 bg-white text-gray-800`}>
              {area}
              <button
                type="button"
                onClick={() => onChange(value.filter((a) => a !== area))}
                aria-label={`Remove ${area}`}
                className="rounded-full text-gray-400 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        id={id}
        type="text"
        value={draft}
        disabled={virtualOnly}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={addDraft}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder={virtualOnly ? "Virtual Only is on. Turn it off to add areas." : "Type an area, then press Enter"}
        className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
      />
    </div>
  );
};
