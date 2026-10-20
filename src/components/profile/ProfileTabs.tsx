"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CredentialsTab } from "@/components/profile/CredentialsTab";
import { ProfileOverviewTab } from "@/components/profile/ProfileOverviewTab";
import { VisibilitySharingTab } from "@/components/profile/VisibilitySharingTab";
import type { MyCredential } from "@/lib/validation/credential";
import type { MyProfile } from "@/lib/validation/interpreterProfile";
import type { MyWebsiteSharing } from "@/lib/websiteProfile";

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
  /** Website permission per connected agency. */
  initialWebsiteSharing: MyWebsiteSharing[];
}

/** Tab bar and animated panel for the "My Profile" page. The page's data lives here so tabs keep it while switching. */
export const ProfileTabs = ({ initialProfile, initialCredentials, connectedAgencyIds, initialWebsiteSharing }: ProfileTabsProps) => {
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [profile, setProfile] = useState<MyProfile>(initialProfile);
  const [credentials, setCredentials] = useState<MyCredential[]>(initialCredentials);
  const [websiteSharing, setWebsiteSharing] = useState<MyWebsiteSharing[]>(initialWebsiteSharing);

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
          {tab === "overview" && (
            <ProfileOverviewTab
              profile={profile}
              onProfileChange={setProfile}
              // The server sent approved website profiles back to review; mirror that on the Visibility tab.
              onWebsiteReReview={() =>
                setWebsiteSharing((list) => list.map((s) => (s.status === "approved" ? { ...s, status: "pending" } : s)))
              }
            />
          )}
          {tab === "credentials" && (
            <CredentialsTab credentials={credentials} onChange={setCredentials} connectedAgencyIds={connectedAgencyIds} />
          )}
          {tab === "visibility" && (
            <VisibilitySharingTab profile={profile} sharing={websiteSharing} onSharingChange={setWebsiteSharing} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
