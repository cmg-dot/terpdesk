"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { StateFormDocument } from "@/components/requests/StateFormDocument";
import type { StateFormView } from "@/lib/stateFormTypes";

interface Summary {
  srn: string | null;
  when: string;
  location: string;
}

/**
 * The state's request form inside a card that folds away, styled like "Job details on file" below it. It starts folded
 * (`defaultOpen` opens it): one row (the SRN, the date and time, the location), so Staffing is on screen without
 * scrolling past all five sections. Whether it is open is plain state of this page; it is not saved anywhere.
 */
export function CollapsibleStateForm({ view, summary, defaultOpen = false }: { view: StateFormView; summary: Summary; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const parts = [summary.srn ? `SRN #${summary.srn}` : "", summary.when, summary.location.split("\n").filter(Boolean).join(", ")].filter(Boolean);
  return (
    <section data-state-form-card data-open={open ? "true" : "false"} className="rounded-2xl border border-gray-200 bg-white">
      <h2 className="text-[16px] font-medium text-[var(--ink)]">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-6 py-4 text-left sm:px-8"
        >
          <span className="min-w-0">
            Request form
            {!open && (
              <span data-state-form-summary className="mt-0.5 block break-words text-sm font-normal text-[var(--sage)]">
                {parts.length > 0 ? parts.join(" · ") : "The state's request form"}
              </span>
            )}
          </span>
          <span className="flex flex-none items-center gap-2 text-sm font-normal text-[var(--sage)]">
            {open ? "Hide" : "Show"}
            <ChevronDown className={`h-5 w-5 text-[var(--forest)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </span>
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="border-t border-gray-100">
          <StateFormDocument view={view} embedded />
        </div>
      )}
    </section>
  );
}
