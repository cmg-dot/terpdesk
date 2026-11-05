import { BillableTimeRow } from "@/components/features/BillableTimeRow";
import { MileageLegsList } from "@/components/features/MileageLegsList";
import { CopyButton } from "@/components/features/hours-review/CopyButton";
import { formatHoursMinutes } from "@/lib/durationFormat";
import { formatDateInZone, formatDateTimeRangeInZone, getIanaZone, parseInstantInZone } from "@/utils/timezone";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

/** What was booked and what was reported: times, mileage, notes, mileage legs, and the "approved" line. Every time is in the job's own zone. */
export function RecordDetails({ record }: { record: ServiceRecord }) {
  // Every time on this card is shown in the job's own zone, never the browser's.
  const zone = getIanaZone(record.timeZone);
  const actualStartDt = parseInstantInZone(record.actualStart, zone) ?? new Date(NaN);
  const actualEndDt = parseInstantInZone(record.actualEnd, zone) ?? new Date(NaN);
  const formattedActual = formatDateTimeRangeInZone(record.actualStart, record.actualEnd, zone);
  const formattedScheduled = formatDateTimeRangeInZone(record.scheduledStart, record.scheduledEnd, zone);
  const formattedTravel = record.travelStart && record.travelEnd
    ? formatDateTimeRangeInZone(record.travelStart, record.travelEnd, zone)
    : "None reported";

  const diffMs = actualEndDt.getTime() - actualStartDt.getTime();
  const serviceMinutes = Math.max(0, (diffMs / 60000) - (record.breakMinutes || 0));
  const serviceTime = formatHoursMinutes(serviceMinutes);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm mb-8">
        <div className="space-y-4">
          <div>
            <div className="text-[var(--sage)] mb-1">Scheduled booking</div>
            <div className="text-[var(--ink)]">{formattedScheduled}</div>
          </div>

          {record.isOdhh ? (
            <>
              <div>
                <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                  <span>Travel time</span>
                  {record.travelStart && (
                    <CopyButton text={formattedTravel} label="travel time" />
                  )}
                </div>
                <div className="text-[var(--ink)]">{formattedTravel}</div>
              </div>
              <div>
                <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                  <span>Service completion</span>
                  <CopyButton
                    text={record.serviceCompleted === 'no' || record.serviceCompleted === false ? "No" : "Yes"}
                    label="service completion"
                  />
                </div>
                <div className="text-[var(--ink)] font-medium">
                  {record.serviceCompleted === 'no' || record.serviceCompleted === false ? "Not completed (No)" : "Completed (Yes)"}
                </div>
              </div>
            </>
          ) : (
            <div>
              <div className="text-[var(--sage)] mb-1">Unpaid break</div>
              <div className="text-[var(--ink)]">{record.breakMinutes > 0 ? `${record.breakMinutes} min` : 'None'}</div>
            </div>
          )}

          <div>
            <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
              <span>Mileage reported</span>
              <CopyButton text={`${(record.reportedMileage ?? 0).toFixed(1)} mi`} label="mileage reported" />
            </div>
            <div className="text-[var(--ink)]">{(record.reportedMileage ?? 0).toFixed(1)} mi</div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
              <span>Reported actual time</span>
              <CopyButton text={formattedActual} label="reported actual time" />
            </div>
            <div className="text-[var(--ink)]">{formattedActual}</div>
          </div>
          <div>
            <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
              <span>Service time</span>
              <CopyButton text={serviceTime} label="service time" />
            </div>
            <div className="text-[var(--ink)]">{serviceTime}</div>
          </div>
          <BillableTimeRow workedMinutes={serviceMinutes} isOdhh={Boolean(record.isOdhh)} />
          <div>
            <div className="text-[var(--sage)] mb-1">Mileage approved by the agency</div>
            <div className="text-[var(--ink)]">{record.state === 'approved' && record.approvedMileage != null ? `${(record.approvedMileage ?? 0).toFixed(1)} mi` : 'Not approved yet'}</div>
          </div>
        </div>
      </div>

      {(record.mileageNote || record.serviceNote) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6 border-t border-gray-100 pt-4">
          {record.mileageNote && (
            <div>
              <div className="text-[var(--sage)] text-xs mb-1 flex items-center justify-between">
                <span>Mileage note</span>
                <CopyButton text={record.mileageNote} label="mileage note" />
              </div>
              <div className="text-[var(--ink)] text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                {record.mileageNote}
              </div>
            </div>
          )}
          {record.serviceNote && (
            <div>
              <div className="text-[var(--sage)] text-xs mb-1 flex items-center justify-between">
                <span>Service note</span>
                <CopyButton text={record.serviceNote} label="service note" />
              </div>
              <div className="text-[var(--ink)] text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                {record.serviceNote}
              </div>
            </div>
          )}
        </div>
      )}

      {(record.serviceCompleted === false || record.serviceCompleted === 'no') && (
        <div className="text-sm mb-6 border-t border-gray-100 pt-4">
          <div className="text-[var(--sage)] text-xs mb-1">Service not completed — reason</div>
          <div className="text-[var(--ink)] text-xs bg-amber-50 p-2.5 rounded-lg border border-amber-100">
            {record.cancellationReason || "No reason given."}
          </div>
        </div>
      )}

      {Array.isArray(record.travelLegs) && record.travelLegs.length > 0 && (
        <div className="text-sm mb-6 border-t border-gray-100 pt-4">
          <div className="text-[var(--sage)] text-xs mb-2">Mileage legs</div>
          <MileageLegsList legs={record.travelLegs} />
        </div>
      )}

      {record.mileageAdjustmentReason && (
        <div className="text-sm mb-6 border-t border-gray-100 pt-4">
          <div className="text-[var(--sage)] text-xs mb-1">Mileage adjusted by the agency — reason</div>
          <div className="text-[var(--ink)] text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
            {record.mileageAdjustmentReason}
          </div>
        </div>
      )}

      {record.state === 'approved' && (
        <div className="text-sm text-gray-600 mb-6 border-t border-gray-200 pt-4">
          Approved {formatDateInZone(new Date(), zone, 'EEE, MMM d')} - v{record.version}. Locked. Approval confirms the service record only; it is not a payment.
        </div>
      )}
    </>
  );
}
