"use client";

import { useState } from "react";
import { decideWebsiteProfile } from "@/app/actions/websiteProfiles";
import { PublicProfileCard } from "@/components/profile/PublicProfileCard";
import type { WebsitePermission, WebsiteProfileRequest } from "@/lib/websiteProfile";

interface WebsiteProfilesTabProps {
  /** Interpreters who opted in (pending) or were approved; already filtered by the page's search box. */
  profiles: WebsiteProfileRequest[];
  /** Called after a decision is saved, with the new status and a message for the page toast. */
  onDecided: (connectionId: string, status: WebsitePermission, message: string) => void;
}

type Decision = "approve" | "decline" | "remove";

const primaryButton =
  "rounded-full bg-[#0B3B32] px-5 py-2 text-[13px] font-medium text-white hover:bg-[#082a23] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "rounded-full border border-gray-200 bg-white px-5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60";

const DONE_MESSAGE: Record<Decision, (name: string) => string> = {
  approve: (name) => `${name} is approved for your website.`,
  decline: (name) => `Declined ${name}'s website request.`,
  remove: (name) => `${name} was removed from your website.`,
};

/** Interpreters page "Website profiles" tab: approve opt-ins, and manage who is currently featured. */
export const WebsiteProfilesTab = ({ profiles, onDecided }: WebsiteProfilesTabProps) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = profiles.filter((p) => p.status === "pending");
  const approved = profiles.filter((p) => p.status === "approved");

  const decide = async (request: WebsiteProfileRequest, decision: Decision) => {
    if (busyId) return;
    setBusyId(request.connectionId);
    setError(null);
    try {
      const result = await decideWebsiteProfile({ connectionId: request.connectionId, decision });
      if (result.success) onDecided(request.connectionId, result.status, DONE_MESSAGE[decision](request.profile.name));
      else setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const renderList = (items: WebsiteProfileRequest[], actions: (r: WebsiteProfileRequest) => JSX.Element) => (
    <ul className="space-y-4">
      {items.map((r) => (
        <li key={r.connectionId} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
          <PublicProfileCard profile={r.profile} />
          <div className="flex flex-wrap gap-3">{actions(r)}</div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-lg font-semibold text-[var(--ink)]">Website profiles</h2>
        <p className="text-[14px] leading-relaxed text-gray-600">
          Interpreters connected to this agency who chose to let you feature them. You decide whether each profile
          appears on your website. Only you can approve, and only they can opt in. Approved profiles show the four
          fields below and nothing else: no contact details, sign-in email or credential files.
        </p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

      <section aria-labelledby="website-pending" className="space-y-3">
        <h3 id="website-pending" className="text-[15px] font-semibold text-[var(--ink)]">
          Waiting for your approval ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="pl-1 text-[14px] text-gray-600">No one is waiting for a decision.</p>
        ) : (
          renderList(pending, (r) => (
            <>
              <button type="button" onClick={() => decide(r, "approve")} disabled={busyId !== null} className={primaryButton}>
                {busyId === r.connectionId ? "Saving…" : "Approve for website"}
              </button>
              <button type="button" onClick={() => decide(r, "decline")} disabled={busyId !== null} className={secondaryButton}>
                Decline
              </button>
            </>
          ))
        )}
      </section>

      <section aria-labelledby="website-approved" className="space-y-3">
        <h3 id="website-approved" className="text-[15px] font-semibold text-[var(--ink)]">
          On your website ({approved.length})
        </h3>
        {approved.length === 0 ? (
          <p className="pl-1 text-[14px] text-gray-600">No approved profiles yet.</p>
        ) : (
          renderList(approved, (r) => (
            <button type="button" onClick={() => decide(r, "remove")} disabled={busyId !== null} className={secondaryButton}>
              {busyId === r.connectionId ? "Saving…" : "Remove from website"}
            </button>
          ))
        )}
      </section>
    </div>
  );
};
