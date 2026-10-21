"use client";

import { useEffect, useState } from "react";
import { getMyJobMessages } from "@/app/actions/jobMessages";
import type { AgencyMessage } from "@/lib/requestActivity";
import { AgencyMessageList } from "@/components/jobDetails/AgencyMessageList";
import { ClarificationButton } from "@/components/jobDetails/ClarificationButton";
import { getIanaZone } from "@/utils/timezone";

/**
 * App job page (booked jobs): the agency's messages to this interpreter and "Request clarification" — the same as the
 * secure job-details page offers.
 */
export function JobQuestionsAndMessages({ offerId, timeZone }: { offerId: string; timeZone?: string }) {
  const [messages, setMessages] = useState<AgencyMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyJobMessages(offerId)
      .then((r) => {
        if (cancelled) return;
        if (r.success) setMessages(r.messages);
        else setError(r.error);
      })
      .catch(() => !cancelled && setError("We could not load messages for this job."));
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-[16px] font-semibold text-[var(--ink)] mb-4">Messages from the agency</h2>
      {error ? (
        <p role="alert" className="text-sm text-red-700">{error}</p>
      ) : messages === null ? (
        <p className="text-sm text-[var(--sage)]">Loading messages…</p>
      ) : (
        <AgencyMessageList messages={messages} timeZone={getIanaZone(timeZone)} />
      )}
      <div className="mt-6 border-t border-gray-100 pt-5 text-center">
        <p className="mb-3 text-[13px] text-[var(--sage)]">Something unclear? Ask the agency a short question about this booking.</p>
        <ClarificationButton target={{ kind: "app", offerId }} />
      </div>
    </div>
  );
}
