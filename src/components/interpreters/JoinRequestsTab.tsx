"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { updateConnectionStatus } from "@/app/actions/approvalActions";
import type { PendingConnection } from "@/app/actions/approvalActions";

interface JoinRequestsTabProps {
  /** Pending agency_interpreters rows for this agency, oldest first. */
  requests: PendingConnection[];
  /** Called once a decision is saved, with the decided request and a message for the page toast. */
  onDecided: (requestId: string, message: string) => void;
}

const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "IN";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatRequestedAt = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/** Interpreters page "Join requests" tab: people who asked to join this agency with its join code. */
export const JoinRequestsTab = ({ requests, onDecided }: JoinRequestsTabProps) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (request: PendingConnection, status: "approved" | "rejected") => {
    if (busyId) return;
    setBusyId(request.id);
    setError(null);
    try {
      const result = await updateConnectionStatus({ connectionId: request.id, status });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onDecided(
        request.id,
        status === "approved"
          ? `${request.interpreterName} is now on your roster.`
          : `Declined the request from ${request.interpreterName}.`,
      );
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <p className="text-gray-600">No one is waiting for a decision.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <ul className="space-y-4">
        <AnimatePresence>
          {requests.map((request) => (
            <motion.li
              layout
              key={request.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-sm transition-shadow list-none"
            >
              <div className="flex min-w-0 items-start gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-base shrink-0 shadow-sm bg-[#0B3B32]">
                  {initialsOf(request.interpreterName)}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <h3 className="truncate text-[17px] font-semibold text-[var(--ink)]">{request.interpreterName}</h3>
                  <p className="truncate text-[13px] text-gray-600">{request.email}</p>
                  <p className="pt-1 text-[11.5px] text-gray-400">
                    Asked to join with your join code · {formatRequestedAt(request.requestedAt)}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => decide(request, "approved")}
                  disabled={busyId !== null}
                  className="px-6 py-2 rounded-full bg-[#0B3B32] text-white text-[13px] font-medium hover:bg-[#082a23] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyId === request.id ? "Saving…" : "Approve"}
                </button>
                <button
                  type="button"
                  onClick={() => decide(request, "rejected")}
                  disabled={busyId !== null}
                  className="px-6 py-2 rounded-full bg-white border border-gray-200 text-gray-700 text-[13px] font-medium hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Decline
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
};
