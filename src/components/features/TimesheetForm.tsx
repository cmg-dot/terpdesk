"use client";

import { useState } from "react";
import { InterpreterSubmitForm } from "@/components/features/InterpreterSubmitForm";
import type { MileageLeg } from "@/components/features/InterpreterSubmitForm";
import { submitTimesheet } from "@/app/actions/submitTimesheet";
import { splitTimesheetError } from "@/lib/timesheetErrors";
import type { DateFieldErrors } from "@/lib/timesheetErrors";

interface TimesheetFormProps {
  token: string;
  defaultStart: string;
  defaultEnd: string;
  timeZoneLabel: string;
  isOdhh: boolean;
  odhhPortalUrl: string | null;
}

const formatServiceTime = (start: string, end: string, breakMinutes: number): string => {
  // Both values are naive wall-clock strings, so their difference is the elapsed wall-clock time.
  const minutes = (new Date(end).getTime() - new Date(start).getTime()) / 60_000 - breakMinutes;
  if (!Number.isFinite(minutes) || minutes <= 0) return "-";
  return `${(minutes / 60).toFixed(1)} hr`;
};

/**
 * Zero-login wrapper around the shared service-time form. It owns state and submission only;
 * the inputs are the same component the logged-in portal uses.
 */
export const TimesheetForm = ({
  token,
  defaultStart,
  defaultEnd,
  timeZoneLabel,
  isOdhh,
  odhhPortalUrl,
}: TimesheetFormProps) => {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [travelStart, setTravelStart] = useState("");
  const [travelEnd, setTravelEnd] = useState("");
  const [serviceCompleted, setServiceCompleted] = useState("yes");
  const [legs, setLegs] = useState<MileageLeg[]>([]);
  const [cancellationReason, setCancellationReason] = useState("");
  const [mileageNote, setMileageNote] = useState("");
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<DateFieldErrors>({});
  const [done, setDone] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const totalMileage = legs.reduce(
    (sum, leg) => sum + (parseFloat(String(leg.distance)) || 0) * (leg.type === "round_trip" ? 2 : 1),
    0,
  );
  const effectiveBreak = isOdhh ? 0 : Math.max(0, parseInt(breakMinutes, 10) || 0);

  const onSubmit = async () => {
    if (isPending) return;
    setError(null);
    setFieldErrors({});
    if (!signature) {
      setError("Please sign before submitting.");
      return;
    }
    if (isOdhh && serviceCompleted === "no" && !cancellationReason.trim()) {
      setError("Please give a reason the service was not completed.");
      return;
    }
    setIsPending(true);
    try {
      const result = await submitTimesheet({
        token,
        actualStartTime: start,
        actualEndTime: end,
        serviceNote: notes,
        mileageNote,
        legs: legs.map((leg) => ({
          fromLabel: leg.from,
          toLabel: leg.to,
          miles: parseFloat(String(leg.distance)) || 0,
          roundTrip: leg.type === "round_trip",
        })),
        signatureDataUrl: signature,
        ...(isOdhh
          ? {
              travelStartsAt: travelStart,
              travelEndsAt: travelEnd,
              serviceCompleted: serviceCompleted !== "no",
              cancellationReason: serviceCompleted === "no" ? cancellationReason : undefined,
            }
          : { breakMinutes: effectiveBreak }),
      });
      if (result.success) setDone(true);
      else {
        const split = splitTimesheetError(result.error);
        setFieldErrors(split.fieldErrors);
        setError(split.formError);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800" role="status">
        Thank you — your timesheet has been submitted for review.
      </div>
    );
  }

  return (
    <div>
      <InterpreterSubmitForm
        compact
        isFutureAppointment={false}
        isSubmitting={isPending}
        isOdhh={isOdhh}
        timeZoneLabel={timeZoneLabel}
        odhhPortalUrl={odhhPortalUrl ?? ""}
        actualStart={start}
        actualEnd={end}
        onActualStartChange={(v) => {
          setStart(v);
          setFieldErrors({});
        }}
        onActualEndChange={(v) => {
          setEnd(v);
          setFieldErrors({});
        }}
        breakMinutes={breakMinutes}
        onBreakMinutesChange={setBreakMinutes}
        travelStart={travelStart}
        travelEnd={travelEnd}
        onTravelStartChange={(v) => {
          setTravelStart(v);
          setFieldErrors({});
        }}
        onTravelEndChange={(v) => {
          setTravelEnd(v);
          setFieldErrors({});
        }}
        serviceCompleted={serviceCompleted}
        onServiceCompletedChange={setServiceCompleted}
        cancellationReason={cancellationReason}
        onCancellationReasonChange={setCancellationReason}
        fieldErrors={fieldErrors}
        formError={error}
        serviceTimeHours={formatServiceTime(start, end, effectiveBreak)}
        mileageLegs={legs}
        totalMileage={totalMileage}
        onAddLeg={() =>
          setLegs((prev) => [...prev, { id: Date.now(), from: "", to: "", distance: "", type: "total" }])
        }
        onRemoveLeg={(id) => setLegs((prev) => prev.filter((leg) => leg.id !== id))}
        onUpdateLeg={(id, field, value) =>
          setLegs((prev) => prev.map((leg) => (leg.id === id ? { ...leg, [field]: value } : leg)))
        }
        mileageNote={mileageNote}
        onMileageNoteChange={setMileageNote}
        note={notes}
        onNoteChange={setNotes}
        hasSignature={Boolean(signature)}
        onSignatureChange={setSignature}
        onSubmit={onSubmit}
        submitLabel="Submit Timesheet"
        submittingLabel="Submitting…"
      />
    </div>
  );
};
