import Link from "next/link";
import { Building2, MapPin, Users2 } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { RequestStatusBadge } from "@/components/requests/RequestStatusBadge";
import { requestStatusLabel } from "@/lib/requestListFilter";
import { asAppointment, asListed } from "@/lib/requestListRow";
import type { RequestListRow } from "@/lib/requestListRow";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";
import { formatReference, getStaffingRatio } from "@/utils/statusEngine";
import { getIanaZone } from "@/utils/timezone";

const parseSafeDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  let d = new Date(value);
  if (!isNaN(d.getTime())) return d;
  if (typeof value === "string") {
    d = new Date(value.replace(" ", "T"));
    if (!isNaN(d.getTime())) return d;
    if (/^\d+$/.test(value)) {
      d = new Date(parseInt(value, 10));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
};

const formatJobDate = (startsAt?: string, endsAt?: string, timeZone?: string): string => {
  const start = parseSafeDate(startsAt);
  if (!start) return "Time not specified";
  try {
    const safeZone = getIanaZone(timeZone);
    const end = parseSafeDate(endsAt);
    const dateStr = formatInTimeZone(start, safeZone, "EEE, MMM d");
    const timeStart = formatInTimeZone(start, safeZone, "h:mm a");
    const timeEnd = formatInTimeZone(end ?? start, safeZone, "h:mm a zzz");
    return `${dateStr} · ${timeStart} – ${timeEnd}`;
  } catch {
    return "Time not specified";
  }
};

/** One appointment on the Requests list: title, time, status, organization, place, reference and who is staffed. */
export function RequestListCard({ req, currentTime }: { req: RequestListRow; currentTime: number }) {
  const org = req.requester.org || "Organization not provided";
  const format = req.format || (req.isVirtual ? "Virtual" : "In person");
  const location = req.location || (format.toLowerCase().includes("virtual") ? "Virtual" : "Location pending");
  const { bookedCount, totalSlots, bookedSlots } = getStaffingRatio(asAppointment(req));
  let staffingText = req.status === "Cancelled" ? "0 of 0 staffed" : `${bookedCount} of ${totalSlots} staffed`;
  if (bookedSlots.length > 0) staffingText += ` (${bookedSlots.map((s) => s.interpreterName).join(", ")})`;

  return (
    <Link href={`/requests/${req.id}`} className="block rounded-2xl border border-[#EBE8DF] bg-white p-5 hover:bg-gray-50 transition-colors cursor-pointer">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="space-y-1">
          <h3 className="text-[17px] font-semibold text-[var(--ink)]">{req.title}</h3>
          <p className="text-[14px] text-[var(--sage)]">{formatJobDate(req.startsAt, req.endsAt, req.timeZone)}</p>
        </div>
        <div className="flex flex-row flex-wrap items-center justify-end gap-2">
          {isAppointmentHappeningNow(req, currentTime) && <HappeningNowBadge size="sm" />}
          <RequestStatusBadge status={requestStatusLabel(asListed(req))} />
        </div>
      </div>

      <div className="mt-4 flex flex-col md:flex-row gap-3 justify-between">
        <div className="flex items-start gap-3 w-full md:w-1/3">
          <Building2 className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-[var(--sage)]">{org}</span>
            <span className="text-[13px] text-slate-400">{req.setting}</span>
          </div>
        </div>
        <div className="flex items-start gap-3 w-full md:w-1/3">
          <MapPin className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-[var(--sage)]">
              {format} · {location}
            </span>
            <span className="text-[13px] text-slate-400 font-medium">{req.srn ? `SRN: ${req.srn}` : formatReference(req.id)}</span>
          </div>
        </div>
        <div className="flex items-start gap-3 w-full md:w-1/3">
          <Users2 className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-[var(--sage)]">{staffingText}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
