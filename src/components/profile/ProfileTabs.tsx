"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CredentialsTab } from "@/components/profile/CredentialsTab";
import { InsuranceSections } from "@/components/profile/InsuranceSections";
import type { MyInsurance } from "@/lib/insurance";
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
  /** The Liability and Commercial Auto policies. */
  initialInsurance: MyInsurance;
  /** Website permission per connected agency. */
  initialWebsiteSharing: MyWebsiteSharing[];
}

/** Tab bar and animated panel for the "My Profile" page. The page's data lives here so tabs keep it while switching. */
export const ProfileTabs = ({ initialProfile, initialCredentials, initialInsurance, initialWebsiteSharing }: ProfileTabsProps) => {
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [profile, setProfile] = useState<MyProfile>(initialProfile);
  const [credentials, setCredentials] = useState<MyCredential[]>(initialCredentials);
  const [insurance, setInsurance] = useState<MyInsurance>(initialInsurance);
  const [websiteSharing, setWebsiteSharing] = useState<MyWebsiteSharing[]>(initialWebsiteSharing);
  // The Overview's "Add your policy document" link opens Credentials already scrolled to Insurance; choosing a tab by hand does not.
  const [revealInsurance, setRevealInsurance] = useState(false);
  const choose = (next: ProfileTab) => {
    setRevealInsurance(false);
    setTab(next);
  };

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
            onClick={() => choose(t.id)}
            className={`rounded-full border px-5 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-[var(--forest)] bg-[var(--forest)] text-[var(--canvas)]"
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
              onOpenInsurance={() => {
                setRevealInsurance(true);
                setTab("credentials");
              }}
              // The server sent approved website profiles back to review; mirror that on the Visibility tab.
              onWebsiteReReview={() =>
                setWebsiteSharing((list) => list.map((s) => (s.status === "approved" ? { ...s, status: "pending" } : s)))
              }
            />
          )}
          {tab === "credentials" && (
            <CredentialsTab
              credentials={credentials}
              onChange={setCredentials}
              timeZone={profile.timeZone}
            >
              <InsuranceSections
                insurance={insurance}
                onChange={setInsurance}
                timeZone={profile.timeZone}
                revealOnMount={revealInsurance}
                // Otherwise the Overview keeps the old date, and saving it there would overwrite the policy's.
                onLiabilityDate={(date) => setProfile((p) => ({ ...p, liabilityInsuranceExpiration: date }))}
              />
            </CredentialsTab>
          )}
          {tab === "visibility" && (
            <VisibilitySharingTab profile={profile} sharing={websiteSharing} onSharingChange={setWebsiteSharing} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
