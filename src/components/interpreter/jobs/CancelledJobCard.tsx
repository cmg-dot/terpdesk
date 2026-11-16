import { CalendarX } from "lucide-react";
import type { Job } from "@/context/InterpreterJobsContext";
import { jobDateLine } from "@/lib/interpreterJobDate";

/** A booking the agency cancelled. Its details and prep materials are no longer available, so the card is not a link. */
export function CancelledJobCard({ job }: { job: Job }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 w-full">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="text-[11px] font-bold tracking-wider text-[var(--sage)] uppercase leading-6">{jobDateLine(job)}</div>
        <span className="inline-flex h-6 items-center gap-1 bg-gray-100 text-gray-600 text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0">
          <CalendarX className="h-3 w-3" aria-hidden="true" />
          Cancelled
        </span>
      </div>
      <h3 className="font-semibold text-[var(--ink)] mb-1">{job.title}</h3>
      <p className="text-sm text-[var(--sage)]">The agency cancelled this appointment. You are no longer booked.</p>
    </div>
  );
}
