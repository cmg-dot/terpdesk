"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { MAX_AVAILABILITY_NOTE, parseAcceptAnswers } from "@/lib/acceptAnswers";
import type { AcceptAnswersInput } from "@/lib/acceptAnswers";

interface Props {
  /** Shown in the heading ("Accept Medical appointment?"). */
  title: string;
  pending: boolean;
  /** The server's refusal, if the last try failed. */
  error: string | null;
  onCancel: () => void;
  onConfirm: (answers: AcceptAnswersInput) => void;
}

const INPUT = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.2)]";

/**
 * Asked before an offer is accepted in the app: "Do you need travel time?" (required; hours and minutes when yes) and an optional
 * partial-availability note. The same questions are on the email link's confirm page; the server checks the answers either way.
 */
export function AcceptOfferDialog({ title, pending, error, onCancel, onConfirm }: Props) {
  const [travel, setTravel] = useState<"" | "yes" | "no">("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const answers: AcceptAnswersInput = { travel: travel || undefined, travelHours: hours, travelMinutes: minutes, availabilityNote: note };
    const check = parseAcceptAnswers(answers);
    if (!check.ok) return setProblem(check.error);
    setProblem(null);
    onConfirm(answers);
  };

  const shown = problem ?? error;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="accept-offer-title">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="accept-offer-title" className="text-lg font-semibold text-[var(--ink)]">Accept {title}?</h2>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-[var(--ink)]">Do you need travel time?</legend>
          <div className="flex gap-2">
            {(["yes", "no"] as const).map((value) => (
              <label key={value} className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 text-center text-sm ${travel === value ? "border-[var(--forest)] bg-[var(--tint)] font-semibold text-[var(--forest)]" : "border-gray-200 text-gray-700"}`}>
                <input type="radio" name="travel" value={value} checked={travel === value} onChange={() => setTravel(value)} className="sr-only" />
                {value === "yes" ? "Yes" : "No"}
              </label>
            ))}
          </div>
          {travel === "yes" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-[var(--sage)]">Hours
                <input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} className={INPUT} aria-label="Travel hours" />
              </label>
              <label className="text-xs text-[var(--sage)]">Minutes
                <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={INPUT} aria-label="Travel minutes" />
              </label>
            </div>
          )}
        </fieldset>

        <label className="block text-sm font-medium text-[var(--ink)]">
          Availability note <span className="font-normal text-[var(--sage)]">(optional)</span>
          <input value={note} maxLength={MAX_AVAILABILITY_NOTE} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Available 10:00–11:00 AM only" className={`mt-1 ${INPUT}`} />
        </label>
        <p className="text-xs text-[var(--sage)]">Accepting books you for this job. Your agency sees these answers on the booking.</p>

        {shown && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{shown}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={pending} className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={pending} className="flex-1 rounded-full bg-[var(--forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--forest-bright)] disabled:opacity-50">
            {pending ? "Accepting…" : "Accept offer"}
          </button>
        </div>
      </form>
    </div>
  );
}
