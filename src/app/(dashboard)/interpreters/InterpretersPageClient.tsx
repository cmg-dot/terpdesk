"use client";

import { motion, AnimatePresence } from "framer-motion";
import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useGlobalState } from "@/context/GlobalContext";
import type { SelectInterpreter } from "@/db/schema";
import { AddExternalInterpreterModal } from "@/components/interpreters/AddExternalInterpreterModal";
import { ImportInterpretersCsvModal } from "@/components/interpreters/ImportInterpretersCsvModal";
import { ManageAccessModal } from "@/components/interpreters/ManageAccessModal";
import type { ManageAccessTarget } from "@/components/interpreters/ManageAccessModal";
import { JoinRequestsTab } from "@/components/interpreters/JoinRequestsTab";
import { RosterTab } from "@/components/interpreters/RosterTab";
import type { RosterItem } from "@/components/interpreters/RosterTab";
import { WebsiteProfilesTab } from "@/components/interpreters/WebsiteProfilesTab";
import type { PendingConnection } from "@/app/actions/approvalActions";
import type { WebsitePermission, WebsiteProfileRequest } from "@/lib/websiteProfile";
import { UserPlus, Upload, Search, CheckCircle2, X } from "lucide-react";

export type InterpretersTab = "roster" | "requests" | "website";

interface InterpretersPageClientProps {
  initialInterpreters: RosterItem[];
  registeredProfileIds: string[];
  /** Pending join requests for this agency, loaded on the server from agency_interpreters. */
  initialJoinRequests: PendingConnection[];
  /** Website opt-ins (pending) and approved website profiles for this agency. */
  initialWebsiteProfiles: WebsiteProfileRequest[];
  initialTab?: InterpretersTab;
}

const tabButtonClass = (active: boolean): string =>
  `px-5 py-2 text-sm font-medium rounded-full transition-colors ${
    active
      ? "bg-[var(--forest)] text-[var(--canvas)] border border-[#0B3B32]"
      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
  }`;

export function InterpretersPageClient({
  initialInterpreters,
  registeredProfileIds,
  initialJoinRequests,
  initialWebsiteProfiles,
  initialTab = "roster",
}: InterpretersPageClientProps) {
  const router = useRouter();
  const { currentUser } = useGlobalState();

  const [interpreterList, setInterpreterList] = useState<RosterItem[]>(initialInterpreters);
  const [joinRequests, setJoinRequests] = useState<PendingConnection[]>(initialJoinRequests);
  const [websiteProfiles, setWebsiteProfiles] = useState<WebsiteProfileRequest[]>(initialWebsiteProfiles);
  const [manageTarget, setManageTarget] = useState<ManageAccessTarget | null>(null);
  const [activeTab, setActiveTab] = useState<InterpretersTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Keep local state in sync when server props revalidate
  useEffect(() => {
    setInterpreterList(initialInterpreters);
  }, [initialInterpreters]);

  useEffect(() => {
    setJoinRequests(initialJoinRequests);
  }, [initialJoinRequests]);

  useEffect(() => {
    setWebsiteProfiles(initialWebsiteProfiles);
  }, [initialWebsiteProfiles]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current));
    }, 4000);
  };

  const query = searchQuery.toLowerCase().trim();

  const filteredRoster = useMemo(() => {
    if (!query) return interpreterList;
    return interpreterList.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query) ||
        (item.phone && item.phone.toLowerCase().includes(query))
    );
  }, [interpreterList, query]);

  const filteredJoinRequests = useMemo(() => {
    if (!query) return joinRequests;
    return joinRequests.filter((r) => r.interpreterName.toLowerCase().includes(query) || r.email.toLowerCase().includes(query));
  }, [joinRequests, query]);

  const filteredWebsiteProfiles = useMemo(() => {
    if (!query) return websiteProfiles;
    return websiteProfiles.filter((p) => p.profile.name.toLowerCase().includes(query));
  }, [websiteProfiles, query]);

  const handleWebsiteDecided = (connectionId: string, status: WebsitePermission, message: string) => {
    setWebsiteProfiles((prev) =>
      status === "approved"
        ? prev.map((p) => (p.connectionId === connectionId ? { ...p, status: "approved" } : p))
        : prev.filter((p) => p.connectionId !== connectionId),
    );
    showToast(message);
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

  const handleCsvImported = (result: { created: number; skippedExisting: number; invalid: unknown[] }) => {
    // New profiles were created on the server; pull the fresh roster.
    router.refresh();
    const parts = [`Imported ${result.created} new ${result.created === 1 ? "interpreter" : "interpreters"}`];
    if (result.skippedExisting > 0) parts.push(`${result.skippedExisting} already existed and ${result.skippedExisting === 1 ? "was" : "were"} left unchanged`);
    if (result.invalid.length > 0) parts.push(`${result.invalid.length} invalid ${result.invalid.length === 1 ? "row was" : "rows were"} skipped`);
    showToast(`${parts.join("; ")}.`);
  };

  const handleJoinRequestDecided = (requestId: string, message: string) => {
    setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
    // An approval adds someone to the roster, so pull the fresh list from the server.
    router.refresh();
    showToast(message);
  };

  const handleAccessChanged = (message: string, change: { id: string; removed: boolean; isActive: boolean }) => {
    setInterpreterList((prev) =>
      change.removed
        ? prev.filter((i) => i.id !== change.id)
        : prev.map((i) => (i.id === change.id ? { ...i, rosterActive: change.isActive } : i)),
    );
    router.refresh();
    showToast(message);
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
      <ManageAccessModal target={manageTarget} onClose={() => setManageTarget(null)} onChanged={handleAccessChanged} />

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

        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-gray-200 bg-white text-[var(--ink)] text-sm font-medium hover:bg-gray-50 transition-all active:scale-95 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Import CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#0B3B32] text-white text-sm font-medium hover:bg-[#082a23] transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add External Interpreter</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <button onClick={() => setActiveTab("roster")} className={tabButtonClass(activeTab === "roster")}>
          Roster ({interpreterList.length})
        </button>
        <button onClick={() => setActiveTab("requests")} className={tabButtonClass(activeTab === "requests")}>
          Join requests ({joinRequests.length})
        </button>
        <button onClick={() => setActiveTab("website")} className={tabButtonClass(activeTab === "website")}>
          Website profiles ({websiteProfiles.filter((p) => p.status === "pending").length} waiting)
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
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          {activeTab === "roster" && (
            <RosterTab
              items={filteredRoster}
              searchQuery={searchQuery}
              registeredProfileIds={registeredProfileIds}
              onManage={setManageTarget}
              onAddExternal={() => setIsAddModalOpen(true)}
            />
          )}
          {activeTab === "requests" && (
            <JoinRequestsTab requests={filteredJoinRequests} onDecided={handleJoinRequestDecided} />
          )}
          {activeTab === "website" && (
            <WebsiteProfilesTab profiles={filteredWebsiteProfiles} onDecided={handleWebsiteDecided} />
          )}
        </motion.div>
      </AnimatePresence>

      <ImportInterpretersCsvModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImported={handleCsvImported} />

      {/* Add External Interpreter Modal */}
      <AddExternalInterpreterModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleInterpreterAdded}
      />
    </motion.div>
  );
}
