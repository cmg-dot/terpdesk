"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getPendingStateJobs } from "@/app/actions/getPendingStateJobs";
import type { PendingStateJob } from "@/app/actions/getPendingStateJobs";
import { logStateJobHours } from "@/app/actions/logStateJobHours";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const inputClass =
  "w-full bg-[#F4F3EF] border-none rounded-full px-5 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none disabled:opacity-60";
const labelClass = "block text-[12px] font-medium text-[var(--sage)] mb-2 ml-2";

const hoursBetween = (start: string, end: string): string => {
  const hours = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
  return Number.isFinite(hours) && hours > 0 ? hours.toFixed(2) : "";
};

const optionKey = (job: PendingStateJob): string => `${job.requestId}:${job.interpreterId}`;

export const LogStateJobHoursDialog = ({ onLogged }: { onLogged?: () => void }) => {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<PendingStateJob[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [serviceHours, setServiceHours] = useState("");
  const [hoursEdited, setHoursEdited] = useState(false);
  const [totalMiles, setTotalMiles] = useState("");
  const [otherFees, setOtherFees] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Load the list each time the dialog opens, so it never offers a job that was just logged.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setJobs(null);
    setLoadError(null);
    getPendingStateJobs()
      .then((list) => !cancelled && setJobs(list))
      .catch(() => !cancelled && setLoadError("Could not load pending state jobs."));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const reset = () => {
    setSelected("");
    setStart("");
    setEnd("");
    setServiceHours("");
    setHoursEdited(false);
    setTotalMiles("");
    setOtherFees("");
    setError(null);
    setDone(false);
  };

  const onOpenChange = (next: boolean) => {
    if (isPending) return;
    setOpen(next);
    if (!next) reset();
  };

  const onSelect = (value: string) => {
    setSelected(value);
    setError(null);
    const job = jobs?.find((j) => optionKey(j) === value);
    if (job) {
      // Prefill from the schedule; the receipt's real times replace these.
      setStart(job.scheduledStart);
      setEnd(job.scheduledEnd);
      setServiceHours(hoursBetween(job.scheduledStart, job.scheduledEnd));
      setHoursEdited(false);
    }
  };

  const onTimeChange = (kind: "start" | "end", value: string) => {
    const nextStart = kind === "start" ? value : start;
    const nextEnd = kind === "end" ? value : end;
    if (kind === "start") setStart(value);
    else setEnd(value);
    if (!hoursEdited) setServiceHours(hoursBetween(nextStart, nextEnd));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const job = jobs?.find((j) => optionKey(j) === selected);
    if (!job || isPending) return;
    setError(null);
    setIsPending(true);
    try {
      const result = await logStateJobHours({
        requestId: job.requestId,
        interpreterId: job.interpreterId,
        actualStartTime: start,
        actualEndTime: end,
        serviceHours: Number(serviceHours),
        totalMiles: Number(totalMiles) || 0,
        otherFees: Number(otherFees) || 0,
      });
      if (result.success) {
        setDone(true);
        onLogged?.();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  const selectedJob = jobs?.find((j) => optionKey(j) === selected);
  const canSubmit = Boolean(selectedJob && start && end && serviceHours) && !isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className="shrink-0 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700">
        Log State Job Hours
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log State Job Hours</DialogTitle>
          <DialogDescription>
            Enter hours from the verified state receipt. They are saved as approved and skip the review queue.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <>
            <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
              Hours logged and approved.
            </p>
            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-full rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 sm:w-auto"
              >
                Done
              </button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <div className="space-y-5">
              <div>
                <label htmlFor="pending-state-job" className={labelClass}>
                  Pending State Jobs
                </label>
                <select
                  id="pending-state-job"
                  value={selected}
                  onChange={(e) => onSelect(e.target.value)}
                  disabled={isPending || jobs === null}
                  className={inputClass}
                >
                  <option value="">
                    {jobs === null ? "Loading…" : jobs.length === 0 ? "No pending state jobs" : "Select a job"}
                  </option>
                  {(jobs ?? []).map((job) => (
                    <option key={optionKey(job)} value={optionKey(job)}>
                      {job.reference} · {job.dateLabel} · {job.interpreterName}
                    </option>
                  ))}
                </select>
                {loadError && <p className="mt-1 ml-2 text-xs text-red-600">{loadError}</p>}
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="state-start" className={labelClass}>
                    Actual start
                  </label>
                  <input
                    id="state-start"
                    type="datetime-local"
                    value={start}
                    onChange={(e) => onTimeChange("start", e.target.value)}
                    disabled={isPending || !selectedJob}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="state-end" className={labelClass}>
                    Actual end
                  </label>
                  <input
                    id="state-end"
                    type="datetime-local"
                    value={end}
                    onChange={(e) => onTimeChange("end", e.target.value)}
                    disabled={isPending || !selectedJob}
                    className={inputClass}
                  />
                </div>
              </div>
              {selectedJob && <p className="-mt-3 ml-2 text-xs text-gray-500">Times are in {selectedJob.timeZone.replace(/_/g, " ")}.</p>}

              <div>
                <label htmlFor="state-hours" className={labelClass}>
                  Service hours
                </label>
                <input
                  id="state-hours"
                  type="number"
                  min="0.01"
                  max="24"
                  step="0.01"
                  value={serviceHours}
                  onChange={(e) => {
                    setHoursEdited(true);
                    setServiceHours(e.target.value);
                  }}
                  disabled={isPending || !selectedJob}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="state-miles" className={labelClass}>
                    Total Miles
                  </label>
                  <input
                    id="state-miles"
                    type="number"
                    min="0"
                    step="0.1"
                    value={totalMiles}
                    onChange={(e) => setTotalMiles(e.target.value)}
                    disabled={isPending || !selectedJob}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="state-fees" className={labelClass}>
                    Other Fees (Parking, Ferry, etc.) in USD
                  </label>
                  <input
                    id="state-fees"
                    type="number"
                    min="0"
                    step="0.01"
                    value={otherFees}
                    onChange={(e) => setOtherFees(e.target.value)}
                    disabled={isPending || !selectedJob}
                    className={inputClass}
                  />
                </div>
              </div>

              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                className="w-full rounded-full border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 sm:w-auto"
              >
                {isPending ? "Saving…" : "Log hours"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
