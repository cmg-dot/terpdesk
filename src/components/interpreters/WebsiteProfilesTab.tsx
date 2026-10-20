"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { WebsiteProfileConsent } from "@/context/GlobalContext";

interface WebsiteProfilesTabProps {
  /** Consents for this agency that the interpreter allowed, already filtered by the page's search box. */
  profiles: WebsiteProfileConsent[];
}

function getMockInterpreterDetails(id: string) {
  if (id === "terp-1") {
    return {
      name: "Active Interpreter",
      location: "Tacoma, WA · South Puget Sound, up to 40 miles",
      initials: "AI",
      color: "bg-[#E28373]",
    };
  } else if (id === "terp-new") {
    return {
      name: "New Interpreter",
      location: "Olympia, WA",
      initials: "NI",
      color: "bg-[#D8B4E2]",
    };
  }
  return {
    name: `Interpreter ${id}`,
    location: "Location not set",
    initials: id.substring(0, 2).toUpperCase(),
    color: "bg-[var(--forest)]",
  };
}

/** Name used by the page's search box to filter website profiles. */
export const websiteProfileName = (interpreterId: string): string => getMockInterpreterDetails(interpreterId).name;

const getBadgeClass = (badge: string) => {
  if (badge === "approved") return "bg-[#E5F0EB] text-[#0A3D31]";
  if (badge === "declined") return "bg-[#FDE8E8] text-[#9B1C1C]";
  return "bg-[#F4F3EF] text-gray-700";
};

/** Interpreters page "Website profiles" tab: interpreters who chose to let the agency feature them. */
export const WebsiteProfilesTab = ({ profiles }: WebsiteProfilesTabProps) => (
  <div className="space-y-6">
    <div className="bg-white rounded-2xl border border-gray-200 p-8">
      <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Website profiles</h2>
      <p className="text-[14px] text-gray-600 leading-relaxed mb-4">
        Interpreters who are active with this agency and chose to let you feature them. You decide whether each profile appears on your website. You cannot turn this permission on for someone; only they can. Approved profiles show exactly the four fields below — nothing else from their account, contact details or credential files.
      </p>
      <p className="text-[14px] text-[var(--sage)]">
        Your website is not switched on, so approving a profile does not show it anywhere yet.
      </p>
    </div>

    {profiles.length === 0 ? (
      <p className="text-gray-600 pl-2">No website profiles found.</p>
    ) : (
      <ul className="space-y-4">
        <AnimatePresence>
          {profiles.map((profile, idx) => {
            const details = getMockInterpreterDetails(profile.interpreter_id);
            return (
              <motion.li
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                key={idx}
                className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-6 hover:transition-shadow list-none"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg shrink-0 ${
                      details.color || "bg-gray-300"
                    }`}
                  >
                    {details.initials}
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-[17px] font-medium text-[var(--ink)]">{details.name}</h3>
                    <p className="text-[13px] text-[var(--sage)] mb-3">{details.location}</p>
                    <div className="mb-4 flex gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-medium ${getBadgeClass(profile.review_state)} capitalize`}
                      >
                        {profile.review_state.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--sage)]">
                      This preview is exactly what the website would show: name, photo, bio and broad service area.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <button className="px-4 py-1.5 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
                    {profile.review_state === "approved" ? "Remove from website" : "Approve for website"}
                  </button>
                  <button className="text-sm font-medium text-[var(--sage)] hover:text-[var(--ink)] transition-colors cursor-pointer">
                    Decline
                  </button>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    )}
  </div>
);
