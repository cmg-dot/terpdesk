"use client";

import { MapPin } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import type { PublicProfile } from "@/lib/websiteProfile";

/**
 * What an agency website would show: photo, name, service area and bio, nothing else.
 * Used by both the interpreter's preview and the agency's review queue, so both see exactly the same card.
 */
export const PublicProfileCard = ({ profile }: { profile: PublicProfile }) => (
  <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-5 sm:flex-row sm:items-start">
    <ProfileAvatar photoUrl={profile.photoUrl} name={profile.name} size={72} />
    <div className="min-w-0 space-y-1.5">
      <h3 className="text-[17px] font-semibold text-[var(--ink)]">{profile.name || "Your name"}</h3>
      <p className="inline-flex items-center gap-1.5 text-[13px] text-gray-600">
        <MapPin className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
        {profile.serviceArea || <span className="text-gray-400">Service area not set</span>}
      </p>
      <p className="whitespace-pre-line text-[14px] leading-relaxed text-gray-700">
        {profile.bio || <span className="text-gray-400">No bio yet.</span>}
      </p>
    </div>
  </div>
);
