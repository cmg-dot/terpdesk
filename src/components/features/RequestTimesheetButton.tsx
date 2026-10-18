"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dispatchTimesheet } from "@/app/actions/dispatchTimesheet";
import { getIanaZone, toUtcIso } from "@/utils/timezone";
import { STATE_JOB_BADGE_TEXT } from "@/lib/stateJob";

interface RequestTimesheetButtonProps {
  requestId: string;
  interpreterId: string;
  /** Identifier of the booking this button belongs to (display/test hook; the action keys on request + interpreter). */
  assignmentId?: string;
  startTime: string;
  endTime: string;
  /** The appointment's own time zone; naive start/end strings are read in it. */
  timezone?: string;
  timesheetDispatched?: boolean;
  timesheetSubmitted?: boolean;
  timesheetApproved?: boolean;
  /** State jobs never get a timesheet request; the button is replaced by a note. */
  isStateJob?: boolean;
  className?: string;
  /** Called with the success message (e.g. to show the page's toast). */
  onSuccess?: (message: string) => void;
}

type Phase = "upcoming" | "in-progress" | "completed";
type Feedback = { kind: "success" | "error"; text: string } | null;

const TICK_MS = 30_000;

const toMs = (value: string, zone: string): number => {
  const iso = toUtcIso(value, zone);
  return iso ? new Date(iso).getTime() : NaN;
};

const getPhase = (nowMs: number, startMs: number, endMs: number): Phase => {
  if (!Number.isNaN(startMs) && nowMs < startMs) return "upcoming";
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && nowMs < endMs) return "in-progress";
  return "completed";
};

const primaryButton =
  "rounded-lg bg-[#163C3A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#122f2d] disabled:cursor-not-allowed disabled:opacity-60";
const outlineButton =
  "rounded-lg border border-[#163C3A] bg-white px-3 py-1.5 text-sm font-medium text-[#163C3A] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  isPending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog = ({ title, message, confirmLabel, isPending, error, onConfirm, onCancel }: ConfirmDialogProps) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Latest callbacks/flags are read through a ref so the effects below run once, not on every render.
  const latest = useRef({ isPending, onCancel });
  latest.current = { isPending, onCancel };

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !latest.current.isPending) latest.current.onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Portaled to <body>: an ancestor with a CSS transform (the page's motion wrapper) would otherwise
  // turn `position: fixed` into "fixed relative to that ancestor".
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isPending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="timesheet-dialog-title"
        aria-describedby="timesheet-dialog-message"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="timesheet-dialog-title" className="text-lg font-semibold text-gray-900">
          {title}
        </h2>
        <p id="timesheet-dialog-message" className="mt-2 text-sm leading-relaxed text-gray-600">
          {message}
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={isPending} className={outlineButton}>
            Cancel
          </button>
          <button type="button" ref={confirmRef} onClick={onConfirm} disabled={isPending} className={primaryButton}>
            {isPending ? "Sending…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const RequestTimesheetButton = ({
  requestId,
  interpreterId,
  assignmentId,
  startTime,
  endTime,
  timezone,
  timesheetDispatched = false,
  timesheetSubmitted = false,
  timesheetApproved = false,
  isStateJob = false,
  className,
  onSuccess,
}: RequestTimesheetButtonProps) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isOpen, setIsOpen] = useState(false);
  // React 18: async startTransition is not pending across the await, so track it explicitly.
  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Keep the state current so the button appears / changes as the appointment starts and ends.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const run = async (): Promise<boolean> => {
    if (isPending) return false;
    setIsPending(true);
    setFeedback(null);
    setDialogError(null);
    try {
      const result = await dispatchTimesheet({ requestId, interpreterId });
      if (result.success) {
        setFeedback({ kind: "success", text: result.message });
        onSuccess?.(result.message);
        return true;
      }
      setFeedback({ kind: "error", text: result.error });
      setDialogError(result.error);
      return false;
    } catch {
      const text = "Something went wrong. Please try again.";
      setFeedback({ kind: "error", text });
      setDialogError(text);
      return false;
    } finally {
      setIsPending(false);
    }
  };

  const onConfirm = async () => {
    const ok = await run();
    if (ok) setIsOpen(false);
  };

  if (isStateJob) {
    return (
      <span
        data-assignment-id={assignmentId}
        className={`inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 ${className ?? ""}`}
      >
        {STATE_JOB_BADGE_TEXT}
      </span>
    );
  }

  // STATE 4: already in. A badge replaces the button.
  if (timesheetSubmitted || timesheetApproved) {
    return (
      <span
        data-assignment-id={assignmentId}
        className={`inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 ${className ?? ""}`}
      >
        {timesheetApproved && !timesheetSubmitted ? "Timesheet Approved" : "Timesheet Submitted - Pending Review"}
      </span>
    );
  }

  const zone = getIanaZone(timezone);
  const phase = getPhase(nowMs, toMs(startTime, zone), toMs(endTime, zone));

  // STATE 1: the appointment has not started yet.
  if (phase === "upcoming") return null;

  const needsConfirm = phase === "in-progress" || timesheetDispatched;
  const isResend = phase === "completed" && timesheetDispatched;

  const dialogTitle = isResend ? "Resend timesheet?" : "Request timesheet early?";
  const dialogMessage = isResend
    ? "The system has already sent a timesheet link to the interpreter automatically. Are you sure you want to send another one?"
    : "This assignment is currently in progress. Are you sure you want to request the timesheet early?";

  const onClick = () => {
    if (needsConfirm) {
      setDialogError(null);
      setIsOpen(true);
    } else {
      void run();
    }
  };

  return (
    <div className={className ?? "mb-4"} data-assignment-id={assignmentId}>
      <button type="button" onClick={onClick} disabled={isPending} className={isResend ? outlineButton : primaryButton}>
        {isPending && !isOpen ? "Sending…" : isResend ? "Resend Timesheet" : "Request Timesheet"}
      </button>

      {feedback && !isOpen && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`mt-2 text-sm ${feedback.kind === "error" ? "text-red-700" : "text-green-700"}`}
        >
          {feedback.text}
        </p>
      )}

      {isOpen && (
        <ConfirmDialog
          title={dialogTitle}
          message={dialogMessage}
          confirmLabel="Confirm"
          isPending={isPending}
          error={dialogError}
          onConfirm={onConfirm}
          onCancel={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};
