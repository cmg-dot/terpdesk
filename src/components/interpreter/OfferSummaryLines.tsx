import { MapPin } from "lucide-react";
import type { DatedJob } from "@/lib/interpreterJobDate";
import { jobDateLine } from "@/lib/interpreterJobDate";
import type { PlaceSource } from "@/lib/jobPlaceLines";
import { jobPlaceLines } from "@/lib/jobPlaceLines";

/** An offer's when and where on the interpreter's home: the date line, then "Facility · Room" and the street address. */
export function OfferSummaryLines({ job }: { job: DatedJob & PlaceSource }) {
  const { primary, secondary } = jobPlaceLines(job);
  return (
    <div className="space-y-1">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-[#A0522D]">{jobDateLine(job)}</p>
      {primary && (
        <p className="flex items-start gap-1.5 text-[13px] leading-snug">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
          <span>
            <span className="block font-medium text-[var(--ink)]">{primary}</span>
            {secondary && <span className="block text-[var(--sage)]">{secondary}</span>}
          </span>
        </p>
      )}
    </div>
  );
}
