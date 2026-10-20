"use client";

import { useMemo, useState } from "react";
import { setWebsiteSharing } from "@/app/actions/websiteSharing";
import { PublicProfileCard } from "@/components/profile/PublicProfileCard";
import { useGlobalState } from "@/context/GlobalContext";
import type { MyProfile } from "@/lib/validation/interpreterProfile";
import { toPublicProfile } from "@/lib/websiteProfile";
import type { MyWebsiteSharing, WebsitePermission } from "@/lib/websiteProfile";

interface VisibilitySharingTabProps {
  profile: MyProfile;
  sharing: MyWebsiteSharing[];
  onSharingChange: (sharing: MyWebsiteSharing[]) => void;
}

const STATUS_BADGE: Record<WebsitePermission, { label: string; className: string }> = {
  not_shared: { label: "Not shared", className: "border-gray-200 bg-gray-100 text-gray-600" },
  pending: { label: "Awaiting agency approval", className: "border-orange-200 bg-orange-50 text-orange-700" },
  approved: { label: "Approved", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

/** "My Profile" Visibility & sharing tab: opt in per agency, and preview the public card. */
export const VisibilitySharingTab = ({ profile, sharing, onSharingChange }: VisibilitySharingTabProps) => {
  const { agencies: knownAgencies } = useGlobalState();
  const [busyAgencyId, setBusyAgencyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Agencies are not stored in the database yet, so names come from the app's agency list.
  const nameOf = (id: string) => knownAgencies.find((a) => a.id === id)?.name ?? "Agency";
  const publicProfile = useMemo(() => toPublicProfile(profile), [profile]);

  const toggle = async (agencyId: string, allow: boolean) => {
    if (busyAgencyId) return;
    const previous = sharing;
    const setStatus = (status: WebsitePermission) =>
      onSharingChange(previous.map((s) => (s.agencyId === agencyId ? { ...s, status } : s)));
    // Show the change at once; the server's answer (or a revert) follows.
    setStatus(allow ? "pending" : "not_shared");
    setBusyAgencyId(agencyId);
    setError(null);
    try {
      const result = await setWebsiteSharing({ agencyId, allow });
      if (result.success) setStatus(result.status);
      else {
        onSharingChange(previous);
        setError(result.error);
      }
    } catch {
      onSharingChange(previous);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusyAgencyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Agency website profile</h2>
        <p className="mb-4 mt-1 text-[13px] text-[var(--sage)]">
          You choose which agencies may feature you. Each agency still decides whether to show you.
        </p>

        {sharing.length === 0 ? (
          <p className="rounded-xl bg-stone-50 px-4 py-3 text-[13px] text-gray-600">
            You are not connected to any agencies yet. Join an agency from the Agencies tab to share your profile.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200">
            {sharing.map((s) => {
              const badge = STATUS_BADGE[s.status];
              return (
                <li key={s.agencyId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-start gap-2.5 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={s.status !== "not_shared"}
                      disabled={busyAgencyId !== null}
                      onChange={(e) => toggle(s.agencyId, e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#0B3B32]"
                    />
                    <span>
                      <span className="block font-medium">{nameOf(s.agencyId)}</span>
                      <span className="text-[13px] text-gray-600">Allow this agency to feature my public profile on its website.</span>
                    </span>
                  </label>
                  <span className={`shrink-0 self-start rounded-full border px-2.5 py-0.5 text-[11px] font-medium sm:self-auto ${badge.className}`}>
                    {badge.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {error && <p role="alert" className="mt-3 text-[12px] text-red-700">{error}</p>}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">What an agency website would show</h2>
        <p className="mb-4 mt-1 text-[13px] text-[var(--sage)]">
          Only your photo, preferred name, service area and bio. Edit them from Overview → Edit profile.
        </p>
        <PublicProfileCard profile={publicProfile} />
        <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-gray-500">
          <p>
            Never included: your sign-in email, private contact details, credential documents, rates, availability, job
            history and private notes. Your photo stays in private storage; a website copy would only be made after an
            agency approves it.
          </p>
          <p>
            If you change your name, photo, bio or service area after approval, the agency reviews it again before the
            change can appear publicly. Withdrawing permission, or an agency connection ending, removes your profile
            from that agency&apos;s website straight away.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Private sharing with agency staff</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
          Credentials, supporting files and contact details are shared privately with agency staff only, and are chosen
          separately under the Credentials tab and in your contact details. Website permission never shares any of them.
        </p>
      </section>
    </div>
  );
};
