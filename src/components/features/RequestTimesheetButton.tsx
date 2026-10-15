"use client";

import { useState } from "react";
import { dispatchTimesheet } from "@/app/actions/dispatchTimesheet";

interface RequestTimesheetButtonProps {
  requestId: string;
  interpreterId: string;
  className?: string;
}

type Feedback = { kind: "success" | "error"; text: string } | null;

export const RequestTimesheetButton = ({ requestId, interpreterId, className }: RequestTimesheetButtonProps) => {
  // React 18: async startTransition is not pending across the await, so track it explicitly.
  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const onClick = async () => {
    if (isPending) return;
    setFeedback(null);
    setIsPending(true);
    try {
      const result = await dispatchTimesheet({ requestId, interpreterId });
      setFeedback(
        result.success
          ? { kind: "success", text: result.message }
          : { kind: "error", text: result.error },
      );
    } catch {
      setFeedback({ kind: "error", text: "Something went wrong. Please try again." });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={className ?? "mb-4"}>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Sending…" : "Request Timesheet"}
      </button>
      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`mt-2 text-sm ${feedback.kind === "error" ? "text-red-700" : "text-green-700"}`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
};
