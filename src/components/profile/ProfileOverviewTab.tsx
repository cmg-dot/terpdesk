"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { ProfileEditForm } from "@/components/profile/ProfileEditForm";
import { ProfileOverviewView } from "@/components/profile/ProfileOverviewView";
import type { MyProfile } from "@/lib/validation/interpreterProfile";

/** "My Profile" Overview tab: read-only view with an "Edit profile" mode. */
export const ProfileOverviewTab = ({ initialProfile }: { initialProfile: MyProfile }) => {
  const [profile, setProfile] = useState<MyProfile>(initialProfile);
  const [editing, setEditing] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!savedMessage) return;
    const timer = setTimeout(() => setSavedMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [savedMessage]);

  if (editing) {
    return (
      <ProfileEditForm
        profile={profile}
        onCancel={() => setEditing(false)}
        onSaved={(saved) => {
          setProfile(saved);
          setEditing(false);
          setSavedMessage("Profile saved.");
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm font-medium text-emerald-700">{savedMessage ?? ""}</p>
        <button
          type="button"
          onClick={() => {
            setSavedMessage(null);
            setEditing(true);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-[#0B3B32] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#082a23]"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit profile
        </button>
      </div>
      <ProfileOverviewView profile={profile} />
    </div>
  );
};
