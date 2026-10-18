"use client";

import { motion, AnimatePresence } from "framer-motion";
import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useGlobalState } from "@/context/GlobalContext";
import type { SelectInterpreter } from "@/db/schema";
import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import { AddExternalInterpreterModal } from "@/components/interpreters/AddExternalInterpreterModal";
import {
  UserPlus,
  Mail,
  Phone,
  Search,
  CheckCircle2,
  X,
  ShieldCheck,
  Send,
  Sparkles,
} from "lucide-react";

interface InterpretersPageClientProps {
  initialInterpreters: SelectInterpreter[];
  registeredProfileIds: string[];
}

// Known emails that have registered dev/app user accounts
const KNOWN_REGISTERED_EMAILS = new Set([
  "dale.fictional@example.com",
  "new.terp@example.com",
  "terp.declined@fictional.test",
]);

function getInterpreterInitials(name: string): string {
  if (!name) return "IN";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarBgColor(name: string, isRegistered: boolean): string {
  if (isRegistered) return "bg-[#0B3B32]"; // Rich forest green for registered users
  // Deterministic palette for external shadow interpreters
  const colors = [
    "bg-[#5B3E96]", // Royal purple
    "bg-[#1E40AF]", // Deep blue
    "bg-[#0E7490]", // Cyan slate
    "bg-[#9A3412]", // Warm terracotta
    "bg-[#374151]", // Charcoal slate
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getMockInterpreterDetails(id: string) {
  if (id === "terp-1") {
    return {
      name: "Active Interpreter",
      location: "Tacoma, WA · South Puget Sound, up to 40 miles",
      initials: "AI",
      color: "bg-[#E28373]",
      badges: ["Active with this agency"],
    };
  } else if (id === "terp-new") {
    return {
      name: "New Interpreter",
      location: "Olympia, WA",
      initials: "NI",
      color: "bg-[#D8B4E2]",
      badges: ["Active with this agency"],
    };
  }
  return {
    name: `Interpreter ${id}`,
    location: "Location not set",
    initials: id.substring(0, 2).toUpperCase(),
    color: "bg-[var(--forest)]",
    badges: ["Active with this agency"],
  };
}

export function InterpretersPageClient({
  initialInterpreters,
  registeredProfileIds,
}: InterpretersPageClientProps) {
  const router = useRouter();
  const {
    currentUser,
    membership_requests,
    approveMembershipRequest,
    declineMembershipRequest,
    website_profile_consent,
  } = useGlobalState();

  const [interpreterList, setInterpreterList] = useState<SelectInterpreter[]>(initialInterpreters);
  const [activeTab, setActiveTab] = useState<"roster" | "requests" | "website">("roster");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Keep local state in sync when server props revalidate
  useEffect(() => {
    setInterpreterList(initialInterpreters);
  }, [initialInterpreters]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current));
    }, 4000);
  };

  const registeredIdSet = useMemo(() => new Set(registeredProfileIds), [registeredProfileIds]);

  const checkIsRegistered = (interpreter: SelectInterpreter): boolean => {
    // A linked login (set when an interpreter registers or claims a shadow profile) is the source of truth.
    if (interpreter.userId) return true;
    const email = interpreter.email.toLowerCase();
    if (KNOWN_REGISTERED_EMAILS.has(email)) return true;
    if (registeredIdSet.has(interpreter.id)) return true;
    if (registeredIdSet.has(interpreter.email)) return true;
    return false;
  };

  // Filter roster interpreters from database
  const filteredRoster = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return interpreterList;
    return interpreterList.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        (item.phone && item.phone.toLowerCase().includes(q))
    );
  }, [interpreterList, searchQuery]);

  const agencyId = currentUser.agency_id || "agency-1";

  // Join Requests Tab
  const pendingRequests = membership_requests
    .filter((r) => r.agency_id === agencyId && r.state === "pending")
    .filter((r) =>
      getMockInterpreterDetails(r.interpreter_id).name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  const answeredRequests = membership_requests
    .filter((r) => r.agency_id === agencyId && r.state !== "pending")
    .filter((r) =>
      getMockInterpreterDetails(r.interpreter_id).name.toLowerCase().includes(searchQuery.toLowerCase())
    );

  // Website Profiles Tab
  const websiteProfiles = website_profile_consent
    .filter((c) => c.agency_id === agencyId && c.allowed)
    .filter((c) =>
      getMockInterpreterDetails(c.interpreter_id).name.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const getBadgeClass = (badge: string) => {
    if (badge.includes("Active") || badge === "approved" || badge === "Approved for the website") {
      return "bg-[#E5F0EB] text-[#0A3D31]";
    }
    if (badge.includes("self-reported") || badge === "declined") {
      return "bg-[#FDE8E8] text-[#9B1C1C]";
    }
    return "bg-[#F4F3EF] text-gray-700";
  };

  const handleInterpreterAdded = (newInterpreter: SelectInterpreter) => {
    // Optimistically update the list if not present
    setInterpreterList((prev) => {
      const exists = prev.some((i) => i.id === newInterpreter.id || i.email.toLowerCase() === newInterpreter.email.toLowerCase());
      if (exists) return prev;
      return [...prev, newInterpreter].sort((a, b) => a.name.localeCompare(b.name));
    });

    // Refresh the Next.js App Router tree to pick up the revalidated server data
    router.refresh();

    showToast(`Successfully added ${newInterpreter.name} to the roster.`);
  };

  if (currentUser.role !== "agency") {
    return (
      <div className="p-8 text-center text-slate-500">
        You do not have permission to view this page.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1200px] mx-auto p-6 space-y-6 pb-24 antialiased"
    >
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-[#0B3B32] text-white px-5 py-3 rounded-2xl shadow-xl border border-[#145347]"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-sm font-medium">{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 text-white/70 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header with Title and Add External Interpreter Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">
            Interpreters
          </h1>
          <p className="text-[15px] text-[var(--sage)]">
            People connected to this agency, and people asking to join it.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#0B3B32] text-white text-sm font-medium hover:bg-[#082a23] transition-all shadow-sm active:scale-95 cursor-pointer self-start sm:self-auto shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add External Interpreter</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <button
          onClick={() => setActiveTab("roster")}
          className={`px-5 py-2 text-sm font-medium rounded-full transition-colors ${
            activeTab === "roster"
              ? "bg-[var(--forest)] text-[var(--canvas)] border border-[#0B3B32]"
              : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          Roster ({interpreterList.length})
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-5 py-2 text-sm font-medium rounded-full transition-colors ${
            activeTab === "requests"
              ? "bg-[var(--forest)] text-[var(--canvas)] border border-[#0B3B32]"
              : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          Join requests ({pendingRequests.length})
        </button>
        <button
          onClick={() => setActiveTab("website")}
          className={`px-5 py-2 text-sm font-medium rounded-full transition-colors ${
            activeTab === "website"
              ? "bg-[var(--forest)] text-[var(--canvas)] border border-[#0B3B32]"
              : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          Website profiles
        </button>
      </div>

      {/* Search Input */}
      <div className="flex flex-col mb-6">
        <label htmlFor="roster-search" className="block text-[13px] text-[var(--sage)] mb-1.5 ml-1">
          Search by name, email, or phone
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            id="roster-search"
            type="text"
            placeholder="Start typing a name, email address, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#F4F3EF] border-none rounded-full pl-11 pr-5 py-3 text-sm text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tab Panels */}
      <AnimatePresence mode="wait">
        {activeTab === "roster" && (
          <motion.div
            key="roster"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <>
                {filteredRoster.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-3">
                    <p className="text-gray-600 text-sm">
                      {searchQuery
                        ? `No interpreters matching "${searchQuery}".`
                        : "No interpreters found in the database."}
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0B3B32] text-white text-xs font-medium hover:bg-[#082a23] transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add First External Interpreter</span>
                    </button>
                  </div>
                ) : (
                  <AnimatedPaginatedList
                    as="ul"
                    items={filteredRoster}
                    itemsPerPage={10}
                    className="space-y-4"
                    getKey={(interpreter) => interpreter.id}
                    renderItem={(interpreter) => {
                    const isRegistered = checkIsRegistered(interpreter);
                    const initials = getInterpreterInitials(interpreter.name);
                    const avatarBg = getAvatarBgColor(interpreter.name, isRegistered);

                    return (
                      <motion.li
                        layout
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        key={interpreter.id}
                        className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:shadow-sm transition-all list-none"
                      >
                        <div className="flex items-start gap-4">
                          {/* Avatar Circle */}
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-base shrink-0 shadow-sm ${avatarBg}`}
                          >
                            {initials}
                          </div>

                          {/* Profile Details */}
                          <div className="flex flex-col space-y-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <h3 className="text-[17px] font-semibold text-[var(--ink)]">
                                {interpreter.name}
                              </h3>

                              {/* UI Badging: Registered App User vs Shadow / External */}
                              {isRegistered ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold bg-[#E5F0EB] text-[#0A3D31] border border-[#BCE1D1]">
                                  <ShieldCheck className="w-3 h-3 text-[#0A3D31]" />
                                  <span>Registered App User</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold bg-[#F3F0FA] text-[#553C9A] border border-[#DDD6FE]">
                                  <Send className="w-3 h-3 text-[#6D28D9]" />
                                  <span>Shadow / External</span>
                                </span>
                              )}

                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F4F3EF] text-gray-600 border border-gray-200/60">
                                Active on Roster
                              </span>
                            </div>

                            {/* Email and Phone */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--sage)] pt-0.5">
                              <span className="inline-flex items-center gap-1.5 text-gray-600 font-medium">
                                <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                {interpreter.email}
                              </span>

                              {interpreter.phone && (
                                <span className="inline-flex items-center gap-1.5 text-gray-500">
                                  <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                  {interpreter.phone}
                                </span>
                              )}
                            </div>

                            {/* Contextual dispatch note */}
                            <p className="text-[11.5px] text-gray-400 pt-1">
                              {isRegistered ? (
                                "Full terpDESK portal access · Receives calendar invites and in-app offers"
                              ) : (
                                "External profile · Receives AWS SES email dispatch with one-click token response"
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-3 sm:pt-1 self-start sm:self-auto">
                          <button
                            type="button"
                            className="text-xs px-3.5 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium transition-colors cursor-pointer"
                          >
                            Manage access
                          </button>
                        </div>
                      </motion.li>
                    );
                  }}
                  />
                )}
            </>
          </motion.div>
        )}

        {activeTab === "requests" && (
          <motion.div
            key="requests"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {pendingRequests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-8">
                <p className="text-gray-600">No one is waiting for a decision.</p>
              </div>
            ) : (
              <ul className="space-y-4">
                <AnimatePresence>
                  {pendingRequests.map((req) => {
                    const details = getMockInterpreterDetails(req.interpreter_id);
                    return (
                      <motion.li
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        key={req.id}
                        className="bg-white rounded-2xl border border-gray-200 p-8 flex flex-col sm:flex-row sm:items-start justify-between gap-6 hover:shadow-sm transition-shadow list-none"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white font-semibold text-[17px] shrink-0 bg-[#0B3B32]">
                            {details.initials}
                          </div>
                          <div className="flex flex-col">
                            <h3 className="text-[19px] font-semibold text-[var(--ink)]">
                              {details.name}
                            </h3>
                            <p className="text-[13px] text-[var(--sage)] mb-4">
                              {details.location === "Location not set"
                                ? "Location not set · Greater Tacoma area"
                                : details.location}
                            </p>

                            <div className="flex flex-col space-y-1 mb-5">
                              <p className="text-[13px] text-gray-700">
                                QA Fictional Certification (expired) · Fictional Certifying Body · 2019
                              </p>
                              <p className="text-[13px] text-gray-700">
                                QA Fictional Liability Policy · Fictional Insurer · 2026
                              </p>
                              <p className="text-[13px] text-gray-700">
                                QA Fictional Mentorship (no expiration) · Fictional Training Co · 2023
                              </p>
                            </div>

                            <p className="text-[11px] text-[#A0AAB4]">
                              Self-reported by the interpreter. terpDESK has not checked these details, and they do not approve anyone for specialised work.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                          <button
                            onClick={() => approveMembershipRequest(req.id)}
                            className="px-6 py-2 rounded-full bg-[#0B3B32] text-white text-[13px] font-medium hover:bg-[#082a23] transition-colors cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => declineMembershipRequest(req.id)}
                            className="px-6 py-2 rounded-full bg-white border border-gray-200 text-gray-700 text-[13px] font-medium hover:bg-gray-50 transition-colors cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 p-8">
              <h2 className="text-lg font-semibold text-[var(--ink)] mb-6">Already answered</h2>
              {answeredRequests.length === 0 ? (
                <p className="text-gray-600">No answered requests yet.</p>
              ) : (
                <ul className="flex flex-col">
                  <AnimatePresence>
                    {answeredRequests.map((req, idx) => {
                      const details = getMockInterpreterDetails(req.interpreter_id);
                      return (
                        <motion.li
                          layout
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          key={req.id}
                          className={`flex items-center gap-4 py-4 ${
                            idx !== answeredRequests.length - 1 ? "border-b border-gray-200" : ""
                          } list-none`}
                        >
                          <span className="text-[15px] font-medium text-[var(--ink)] min-w-[150px]">
                            {details.name}
                          </span>
                          <span
                            className={`px-3 py-1 rounded-full text-[11px] font-medium ${getBadgeClass(
                              req.state
                            )} capitalize`}
                          >
                            {req.state}
                          </span>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === "website" && (
          <motion.div
            key="website"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-2xl border border-gray-200 p-8">
              <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Website profiles</h2>
              <p className="text-[14px] text-gray-600 leading-relaxed mb-4">
                Interpreters who are active with this agency and chose to let you feature them. You decide whether each profile appears on your website. You cannot turn this permission on for someone; only they can. Approved profiles show exactly the four fields below — nothing else from their account, contact details or credential files.
              </p>
              <p className="text-[14px] text-[var(--sage)]">
                Your website is not switched on, so approving a profile does not show it anywhere yet.
              </p>
            </div>

            {websiteProfiles.length === 0 ? (
              <p className="text-gray-600 pl-2">No website profiles found.</p>
            ) : (
              <ul className="space-y-4">
                <AnimatePresence>
                  {websiteProfiles.map((profile, idx) => {
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
                            <h3 className="text-[17px] font-medium text-[var(--ink)]">
                              {details.name}
                            </h3>
                            <p className="text-[13px] text-[var(--sage)] mb-3">{details.location}</p>
                            <div className="mb-4 flex gap-2">
                              <span
                                className={`px-3 py-1 rounded-full text-[11px] font-medium ${getBadgeClass(
                                  profile.review_state
                                )} capitalize`}
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
                            {profile.review_state === "approved"
                              ? "Remove from website"
                              : "Approve for website"}
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add External Interpreter Modal */}
      <AddExternalInterpreterModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleInterpreterAdded}
      />
    </motion.div>
  );
}
