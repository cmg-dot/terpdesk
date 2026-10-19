"use client";

import { useEffect, useState } from "react";
import { getPendingInterpreters, updateInterpreterStatus } from "@/app/actions/approvalActions";
import type { PendingInterpreter } from "@/app/actions/approvalActions";

/** Agency dashboard card: new interpreter registrations that need a decision before they can sign in. */
export const ApprovalQueue = () => {
  const [pending, setPending] = useState<PendingInterpreter[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPendingInterpreters()
      .then(setPending)
      .catch(() => setPending([]));
  }, []);

  const decide = async (id: string, status: "approved" | "rejected") => {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      const result = await updateInterpreterStatus({ userId: id, status });
      if (result.success) setPending((prev) => (prev ?? []).filter((p) => p.id !== id));
      else setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  // Nothing waiting (or still loading): stay out of the way.
  if (!pending || pending.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50/60 p-6" aria-labelledby="approval-queue-title">
      <h2 id="approval-queue-title" className="text-[17px] font-semibold text-[var(--ink)]">
        Registrations awaiting approval ({pending.length})
      </h2>
      <p className="mb-4 mt-1 text-[13px] text-[var(--sage)]">
        These interpreters cannot sign in until you approve them.
      </p>

      <ul className="divide-y divide-amber-200/70">
        {pending.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-[var(--ink)]">{p.name}</p>
              <p className="truncate text-[13px] text-[var(--sage)]">{p.email}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => decide(p.id, "approved")}
                disabled={busyId !== null}
                className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyId === p.id ? "Saving…" : "Approve"}
              </button>
              <button
                type="button"
                onClick={() => decide(p.id, "rejected")}
                disabled={busyId !== null}
                className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}
    </section>
  );
};
