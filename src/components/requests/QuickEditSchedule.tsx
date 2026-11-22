"use client";

import { Info } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconInput } from "@/components/ui/IconInput";
import { STATE_PORTAL_TIME_NOTE } from "@/lib/bookedTimeEdit";
import { plainOptions, withCurrent } from "@/lib/dropdown";
import type { QuickEditValues } from "@/lib/quickEditAccess";

const TIME_ZONES = plainOptions(["Pacific Time — Seattle, Los Angeles", "Mountain Time — Denver", "Arizona (no daylight saving)", "Central Time — Chicago", "Eastern Time — New York", "Alaska Time", "Hawaii Time"]);

const labelClass = "mb-1 block text-xs font-medium text-gray-700";
const inputClass = "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[var(--forest)]";

interface Props {
  values: QuickEditValues;
  onChange: (patch: Partial<QuickEditValues>) => void;
  /** An interpreter is booked: the time zone is fixed; the date and times can still move (the server checks the interpreters are free). */
  booked: boolean;
  /** A State (ODHH) or Apple Health job: its times also live in the State portal, which this does not update. */
  stateJob: boolean;
  timesInvalid: boolean;
}

/** The "Date, Time & Timezone" part of the Quick Edit modal. */
export const QuickEditSchedule = ({ values, onChange, booked, stateJob, timesInvalid }: Props) => (
  <div className="space-y-3.5 rounded-xl border border-gray-200 bg-white/70 p-4">
    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Date, Time & Timezone</h4>

    {booked && (
      <p className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs leading-relaxed text-sky-900">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden="true" />
        <span>
          An interpreter is booked. You can change the date and times before the appointment starts: the new time is saved only if every booked interpreter is free then, and they are told. The time zone stays fixed.
          {stateJob && <span className="mt-1 block font-medium" data-state-portal-note="">{STATE_PORTAL_TIME_NOTE}</span>}
        </span>
      </p>
    )}

    <div>
      <label htmlFor="quick-edit-timezone" className={labelClass}>Appointment Time Zone</label>
      <Dropdown
        id="quick-edit-timezone"
        value={values.timeZone}
        onChange={(timeZone) => onChange({ timeZone })}
        options={withCurrent(TIME_ZONES, values.timeZone)}
        disabled={booked}
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
