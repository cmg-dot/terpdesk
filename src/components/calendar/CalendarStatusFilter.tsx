"use client";

import { CustomSelect } from "@/components/ui/CustomSelect";
import { STATUS_FILTER_OPTIONS } from "@/lib/requestListFilter";

/**
 * The calendar's status filter: the very same dropdown and options as Requests & assignments, so "Active Appointments"
 * means the same thing in both places. Cancelled jobs only appear once "All appointments" or "Cancelled" is chosen.
 */
export const CalendarStatusFilter = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <div className="w-full sm:w-64">
    <CustomSelect size="large" ariaLabel="Filter appointments by status" options={[...STATUS_FILTER_OPTIONS]} value={value} onChange={onChange} />
  </div>
);

/** The grey "Cancelled" pill on a cancelled job's calendar card. */
export const CancelledBadge = ({ voided = false }: { voided?: boolean }) => (
  <span className="inline-block rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">{voided ? "Void" : "Cancelled"}</span>
);

/** The muted, dashed look of a cancelled job's card, used in place of the live / past / upcoming look. */
export const CANCELLED_CARD = {
  month: "border border-dashed border-gray-300 bg-gray-50 text-gray-400 opacity-70 hover:opacity-100",
  week: "border border-dashed border-gray-300 bg-gray-50 text-gray-400 opacity-70 hover:opacity-100",
  day: "border border-dashed border-gray-300 bg-gray-50 text-gray-400 opacity-70 hover:opacity-100",
} as const;

/** Strike-through for a cancelled job's title. */
export const CANCELLED_TITLE = "line-through decoration-gray-400";
