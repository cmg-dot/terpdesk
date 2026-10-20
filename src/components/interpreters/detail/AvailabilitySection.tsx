import Link from "next/link";
import { formatSpan } from "@/lib/availabilitySummary";
import type { DayAvailability, DaySpan } from "@/lib/availabilitySummary";

interface AvailabilitySectionProps {
  days: DayAvailability[];
  sharesAvailability: boolean;
  timeZoneLabel: string;
}

/** "Free 9:00 AM – 5:00 PM (PDT)" or "Free all day". Times are already in the interpreter's zone. */
const label = (prefix: string, s: DaySpan, d: DayAvailability): string => {
  const text = formatSpan(s, d);
  return text === "All day" ? `${prefix} all day` : `${prefix} ${text}`;
};

/**
 * Read-only next-two-weeks view. Free hours and private busy time appear only when the interpreter shares their
 * availability with this agency; jobs they accepted from this agency always appear.
 */
export const AvailabilitySection = ({ days, sharesAvailability, timeZoneLabel }: AvailabilitySectionProps) => {
  const bookedDays = days.filter((d) => d.booked.length > 0);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold text-[var(--ink)]">Availability</h2>
      <p className="mb-4 text-[12px] text-gray-500">Next 14 days, shown in the interpreter&apos;s time zone ({timeZoneLabel}).</p>

      {!sharesAvailability && (
        <p className="mb-4 rounded-xl bg-stone-50 px-4 py-3 text-[13px] text-gray-600">
          This interpreter has not shared their availability with your agency, so only jobs they accepted from you are
          listed. Send an offer to check whether they are free.
        </p>
      )}

      {sharesAvailability ? (
        <ul className="divide-y divide-stone-200">
          {days.map((d) => (
            <li key={d.date} className="flex flex-col gap-1.5 py-3 md:flex-row md:gap-6">
              <span className="w-28 shrink-0 text-[14px] font-medium text-[var(--ink)]">{d.label}</span>
              <div className="flex flex-wrap gap-2">
                {d.dayOff && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[12px] text-gray-600">Unavailable all day</span>}
                {d.free.map((s) => (
                  <span key={`f-${s.start}`} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[12px] text-emerald-800">
                    {label("Free", s, d)}
                  </span>
                ))}
                {d.booked.map((s) => (
                  <Link
                    key={`b-${s.requestId}-${s.start}`}
                    href={`/requests/${s.requestId}`}
                    className="rounded-full border border-[#BCE1D1] bg-[#E5F0EB] px-2.5 py-0.5 text-[12px] text-[#0A3D31] hover:underline"
                  >
                    {label("Booked with you", s, d)}
                  </Link>
                ))}
                {d.busy.map((s) => (
                  <span key={`x-${s.start}`} className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-[12px] text-gray-600">
                    {label("Busy", s, d)}
                  </span>
                ))}
                {!d.dayOff && d.free.length === 0 && d.booked.length === 0 && d.busy.length === 0 && (
                  <span className="text-[12px] text-gray-400">No working hours set</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : bookedDays.length === 0 ? (
        <p className="text-[13px] text-gray-500">No upcoming jobs with your agency.</p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {bookedDays.map((d) => (
            <li key={d.date} className="flex flex-col gap-1.5 py-3 md:flex-row md:gap-6">
              <span className="w-28 shrink-0 text-[14px] font-medium text-[var(--ink)]">{d.label}</span>
              <div className="flex flex-wrap gap-2">
                {d.booked.map((s) => (
                  <Link
                    key={`b-${s.requestId}-${s.start}`}
                    href={`/requests/${s.requestId}`}
                    className="rounded-full border border-[#BCE1D1] bg-[#E5F0EB] px-2.5 py-0.5 text-[12px] text-[#0A3D31] hover:underline"
                  >
                    {label("Booked with you", s, d)}
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
