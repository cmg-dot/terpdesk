"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { CheckCircle2 } from "lucide-react";
import { submitInterpreterHours } from "@/app/actions/submitInterpreterHours";
import { InterpreterSubmitForm } from "@/components/features/InterpreterSubmitForm";
import { useInterpreterJobs } from "@/context/InterpreterJobsContext";
import type { Job } from "@/context/InterpreterJobsContext";
import { readFiledCancellation } from "@/lib/cancellationFiled";
import type { DateFieldErrors } from "@/lib/timesheetErrors";
import { splitTimesheetError } from "@/lib/timesheetErrors";
import { getIanaZone, resolveRequestTimes } from "@/utils/timezone";

const LOCAL = "yyyy-MM-dd'T'HH:mm";
const NOTE_START = "The appointment was cancelled by the agency with short notice.";
const noop = (): void => undefined;

/**
 * The cancellation form, on the interpreter's cancelled job: the app's hours form in cancellation mode. The booked times are filled in
 * and read-only; the interpreter adds travel (if they had started), a cancellation note and their signature. The server decides
 * everything that matters (submitInterpreterHours.ts): it refuses a job that is not their own billable cancellation, fixes the times,
 * records no mileage, and leaves the job cancelled.
 */
export function CancellationFormPanel({ job }: { job: Job }) {
  const router = useRouter();
  const { refreshJobs } = useInterpreterJobs();
  const [pending, startTransition] = useTransition();
  const filed = readFiledCancellation(job.hoursSubmission);
  const zone = getIanaZone(typeof job.details?.timeZone === "string" ? job.details.timeZone : job.timeZone);
  const { startsAt, endsAt } = resolveRequestTimes(job);
  const local = (iso: string): string => (iso ? formatInTimeZone(iso, zone, LOCAL) : "");

  const [editing, setEditing] = useState(!filed);
  const [travelStart, setTravelStart] = useState(local(filed?.travelStart ?? ""));
  const [travelEnd, setTravelEnd] = useState(local(filed?.travelEnd ?? ""));
  const [reason, setReason] = useState(filed?.note || NOTE_START);
  const [note, setNote] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<DateFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      try {
        await submitInterpreterHours(job.requestId, startsAt, endsAt, 0, {
          travelStartTime: travelStart ? fromZonedTime(travelStart, zone).toISOString() : null,
          travelEndTime: travelEnd ? fromZonedTime(travelEnd, zone).toISOString() : null,
          cancellationReason: reason.trim(),
          note,
          version: filed ? filed.version + 1 : 1,
          ...(signature ? { signatureDataUrl: signature } : {}),
        });
      } catch (err) {
        const split = splitTimesheetError(err instanceof Error && err.message ? err.message : "Could not submit the form. Please try again.");
        setFieldErrors(split.fieldErrors);
        setFormError(split.formError);
        return;
      }
      setEditing(false);
      await refreshJobs();
      router.refresh();
    });
  };

  if (!editing && filed) {
    return (
      <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left text-sm text-emerald-900" data-cancellation-filed="">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Cancellation form submitted
        </p>
        <p className="mt-1 text-[13px]">
          {filed.travelStart && filed.travelEnd ? `Travel reported: ${local(filed.travelStart).replace("T", " ")} to ${local(filed.travelEnd).replace("T", " ")}. ` : "No travel reported. "}
          The agency has it on file.
        </p>
        <button type="button" onClick={() => setEditing(true)} className="mt-3 rounded-full border border-emerald-300 bg-white px-4 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100">
          Update my submission
        </button>
      </div>
    );
  }

  return (
    <div className="text-left" data-cancellation-form="">
      <InterpreterSubmitForm
        mode="cancellation"
        compact
        isFutureAppointment={false}
        isSubmitting={pending}
        isOdhh={false}
        timeZoneLabel={String(zone).replace(/_/g, " ")}
        odhhPortalUrl=""
        actualStart={local(startsAt)}
        actualEnd={local(endsAt)}
        onActualStartChange={noop}
        onActualEndChange={noop}
        breakMinutes=""
        onBreakMinutesChange={noop}
        travelStart={travelStart}
        travelEnd={travelEnd}
        onTravelStartChange={(v) => { setTravelStart(v); setFieldErrors({}); }}
        onTravelEndChange={(v) => { setTravelEnd(v); setFieldErrors({}); }}
        serviceCompleted="no"
        onServiceCompletedChange={noop}
        cancellationReason={reason}
        onCancellationReasonChange={setReason}
        fieldErrors={fieldErrors}
        formError={formError}
        serviceTimeHours=""
        mileageLegs={[]}
        totalMileage={0}
        onAddLeg={noop}
        onRemoveLeg={noop}
        onUpdateLeg={noop}
        mileageNote=""
        onMileageNoteChange={noop}
        note={note}
        onNoteChange={setNote}
        hasSignature={Boolean(signature)}
        onSignatureChange={setSignature}
        onSubmit={submit}
      />
    </div>
  );
}
