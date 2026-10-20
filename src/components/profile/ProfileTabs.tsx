"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CredentialsTab } from "@/components/profile/CredentialsTab";
import { ProfileOverviewTab } from "@/components/profile/ProfileOverviewTab";
import type { MyCredential } from "@/lib/validation/credential";
import type { MyProfile } from "@/lib/validation/interpreterProfile";

type ProfileTab = "overview" | "credentials" | "visibility";

const TABS: { id: ProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "credentials", label: "Credentials" },
  { id: "visibility", label: "Visibility & sharing" },
];

interface ProfileTabsProps {
  initialProfile: MyProfile;
  initialCredentials: MyCredential[];
  /** Agencies the interpreter is connected to; credentials can be shared with these. */
  connectedAgencyIds: string[];
}

/** Tab bar and animated panel for the "My Profile" page. The page's data lives here so tabs keep it while switching. */
export const ProfileTabs = ({ initialProfile, initialCredentials, connectedAgencyIds }: ProfileTabsProps) => {
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [profile, setProfile] = useState<MyProfile>(initialProfile);
  const [credentials, setCredentials] = useState<MyCredential[]>(initialCredentials);

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Profile sections" className="flex flex-wrap gap-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`profile-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="profile-tabpanel"
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-5 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-[#0B3B32] bg-[var(--forest)] text-[var(--canvas)]"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          role="tabpanel"
          id="profile-tabpanel"
          aria-labelledby={`profile-tab-${tab}`}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "overview" && <ProfileOverviewTab profile={profile} onProfileChange={setProfile} />}
          {tab === "credentials" && (
            <CredentialsTab credentials={credentials} onChange={setCredentials} connectedAgencyIds={connectedAgencyIds} />
          )}
          {tab === "visibility" && (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
              <h2 className="text-lg font-semibold text-[var(--ink)]">Visibility &amp; sharing</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-[var(--sage)]">
                Controls for what each agency can see are coming in a later phase. For now, choose who sees your work
                email and phone from Overview → Edit profile.
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
