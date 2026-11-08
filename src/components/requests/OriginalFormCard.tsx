"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getOriginalForms } from "@/app/actions/originalForms";
import { OriginalFormBody } from "@/components/requests/OriginalFormBody";
import type { OriginalFormsResult } from "@/lib/originalForms";

const FAILED: OriginalFormsResult = { success: false, error: "We could not load the original email. Please try again." };

/**
 * "Original form": the state's own email for this job, exactly as it arrived, in a card that folds away like the request
 * form above it. It starts folded and loads nothing until it is opened for the first time; the answer is then kept, so
 * folding and unfolding again costs nothing. A failed load is tried again the next time it is opened. Read-only.
 */
export function OriginalFormCard({ requestId, srn }: { requestId: string; srn: string | null }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<OriginalFormsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const bodyId = useId();

  const load = async () => {
    inFlight.current = true;
    setLoading(true);
    const answer = await getOriginalForms(requestId).catch((): OriginalFormsResult => FAILED);
    setResult(answer);
    setLoading(false);
    inFlight.current = false;
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !inFlight.current && !result?.success) void load();
  };

  return (
    <section id="original-form" data-original-form-card data-open={open ? "true" : "false"} className="rounded-2xl border border-gray-200 bg-white">
      <h2 className="text-[16px] font-medium text-[var(--ink)]">
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId} className="flex w-full items-center justify-between gap-3 rounded-2xl px-6 py-4 text-left sm:px-8">
          <span className="min-w-0">
            Original form
            <span className="mt-0.5 block break-words text-sm font-normal text-[var(--sage)]">
              {srn ? `State SRN ${srn} · ` : ""}As the state sent it. Read-only.
            </span>
          </span>
          <span className="flex flex-none items-center gap-2 text-sm font-normal text-[var(--sage)]">
            {open ? "Hide" : "Show"}
            <ChevronDown className={`h-5 w-5 text-[var(--forest)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </span>
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="border-t border-gray-100">
          <OriginalFormBody loading={loading} result={result} />
        </div>
      )}
    </section>
  );
}
