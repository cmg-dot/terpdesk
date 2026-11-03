"use client";

import { Lock } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconInput } from "@/components/ui/IconInput";
import { plainOptions, withCurrent } from "@/lib/dropdown";
import type { QuickEditValues } from "@/lib/quickEditAccess";
import { formatDetailsDate } from "@/lib/requestDetailsFormat";

const TIME_ZONES = plainOptions(["Pacific Time — Seattle, Los Angeles", "Mountain Time — Denver", "Arizona (no daylight saving)", "Central Time — Chicago", "Eastern Time — New York", "Alaska Time", "Hawaii Time"]);

const labelClass = "mb-1 block text-xs font-medium text-gray-700";
const inputClass = "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[#0B3B32]";

const asInstant = (value: unknown): string | Date | null => (typeof value === "string" || value instanceof Date ? value : null);

interface Props {
  values: QuickEditValues;
  onChange: (patch: Partial<QuickEditValues>) => void;
  /** An interpreter is booked: the date, time and time zone cannot change. */
  locked: boolean;
  /** The request's stored start and end, shown while locked. */
  startsAt: unknown;
  endsAt: unknown;
  timesInvalid: boolean;
}

/** The "Date, Time & Timezone" part of the Quick Edit modal: editable, or a locked summary while an interpreter is booked. */
export const QuickEditSchedule = ({ values, onChange, locked, startsAt, endsAt, timesInvalid }: Props) => {
  if (locked) {
    return (
      <div className="space-y-2.5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
          <Lock className="h-3.5 w-3.5 shrink-0 text-amber-700" />
          <span>Date, time & timezone are locked</span>
        </div>
        <p className="text-xs leading-relaxed text-amber-800">
          The date, time and time zone cannot be changed while an interpreter is booked: moving them would skip the availability check they were booked under. You can still update meeting credentials, venue instructions, contacts and notes below.
        </p>
        <div className="flex items-center justify-between rounded-lg border border-amber-200/50 bg-white/90 p-2.5 text-xs text-gray-700">
          <span>{formatDetailsDate(asInstant(startsAt), asInstant(endsAt), values.timeZone)}</span>
          <span className="font-mono text-gray-500">{values.timeZone.split(" — ")[0]}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 rounded-xl border border-gray-200 bg-white/70 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Date, Time & Timezone</h4>

      <div>
        <label htmlFor="quick-edit-timezone" className={labelClass}>Appointment Time Zone</label>
        <Dropdown
          id="quick-edit-timezone"
          value={values.timeZone}
          onChange={(timeZone) => onChange({ timeZone })}
          options={withCurrent(TIME_ZONES, values.timeZone)}
          className="w-full"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <span className={labelClass}>Start Date</span>
          <IconInput kind="date" aria-label="Start date" value={values.startDate} onChange={(e) => onChange({ startDate: e.target.value })} className={inputClass} />
        </div>
        <div>
          <span className={labelClass}>Start Time</span>
          <IconInput kind="time" aria-label="Start time" value={values.startTime} onChange={(e) => onChange({ startTime: e.target.value })} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <span className={labelClass}>End Date</span>
          <IconInput kind="date" aria-label="End date" value={values.endDate} onChange={(e) => onChange({ endDate: e.target.value })} className={inputClass} />
        </div>
        <div>
          <span className={labelClass}>End Time</span>
          <IconInput kind="time" aria-label="End time" value={values.endTime} onChange={(e) => onChange({ endTime: e.target.value })} className={inputClass} />
        </div>
      </div>

      {timesInvalid && <p className="mt-1 text-xs font-medium text-red-600">The end time must be after the start time.</p>}
    </div>
  );
};
