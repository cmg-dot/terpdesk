"use client";

import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
import { useState, useMemo, Suspense } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { formatReference } from "@/utils/statusEngine";
import { DEFAULT_STATUS_FILTER, FILTER_VIEWS, STATUS_FILTER_OPTIONS, isStatusFilter, matchesStatusFilter } from "@/lib/requestListFilter";
import type { StatusFilter } from "@/lib/requestListFilter";
import { RequestListCard } from "@/components/requests/RequestListCard";
import { useRequestList } from "@/hooks/useRequestList";
import { useListTab } from "@/hooks/useListTab";
import type { ListTab } from "@/hooks/useListTab";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { asListed } from "@/lib/requestListRow";
import type { RequestListRow } from "@/lib/requestListRow";
import { isAppointmentUpcoming, sortUpcomingWithHappeningNow } from "@/utils/happeningNow";

/** The dashboard's links into this list (`/requests?filter=...`). */
const FILTER_PARAMS: Record<string, StatusFilter> = {
  "happening-now": "Happening now",
  "needing-coverage": "Needing coverage",
  "pending-offers": "Pending offers",
  "staff-follow-up": "Staff follow-up",
  "needs-replacement": "Needs replacement",
  "partially-staffed": "Partially staffed",
};

function ListSection({ title, note, empty, items, currentTime }: { title: string; note: string; empty: string; items: RequestListRow[]; currentTime: number }) {
  return (
    <div className="space-y-5 pb-12">
      <div className="space-y-1 pl-1">
        <h2 className="text-[19px] font-semibold text-[var(--ink)]">{title}</h2>
        <p className="text-[14px] text-[var(--sage)]">{note}</p>
      </div>
      <div className="space-y-4">
        {items.length === 0 && <p className="text-[14px] text-[var(--sage)] pl-1">{empty}</p>}
        <AnimatedPaginatedList
          items={items}
          itemsPerPage={5}
          className="space-y-4"
          getKey={(req) => req.id}
          renderItem={(req) => <RequestListCard req={req} currentTime={currentTime} />}
        />
      </div>
    </div>
  );
}

function TabButton({ tab, active, count, onSelect }: { tab: ListTab; active: boolean; count: number; onSelect: (tab: ListTab) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab)}
      className={`flex-1 text-[13px] font-medium py-2 rounded-full flex items-center justify-center gap-1.5 transition-all ${active ? "bg-[var(--pill)] text-white shadow-sm" : "text-[var(--sage)] hover:text-gray-700"}`}
    >
      {tab === "upcoming" ? "Upcoming" : "Past"} <span className="font-normal opacity-80">{count}</span>
    </button>
  );
}

function RequestsPageContent() {
  const { requests, loaded } = useRequestList();
  const searchParams = useSearchParams();
  const currentTime = useMinuteClock();

  const [searchQuery, setSearchQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState("All organizations");
  const [formatFilter, setFormatFilter] = useState("All formats");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => FILTER_PARAMS[searchParams.get("filter") ?? ""] ?? DEFAULT_STATUS_FILTER);
  const view = FILTER_VIEWS[statusFilter];

  const orgOptions = useMemo(() => {
    const orgs = new Set<string>();
    requests.forEach((req) => {
      const org = req.requester.org || req.client;
      if (org && org.trim()) orgs.add(org.trim());
    });
    return ["All organizations", ...Array.from(orgs).sort()];
  }, [requests]);

  // Every status, count and name comes from the database (the lean rows), never from a copy the browser kept.
  const filteredRequests = requests.filter((req) => {
    const searchLower = searchQuery.toLowerCase();
    const titleMatch = req.title.toLowerCase().includes(searchLower);
    const cleanRef = formatReference(req.id).toLowerCase();
    const refMatch = req.id.toLowerCase().includes(searchLower) || cleanRef.includes(searchLower);
    const orgMatch = req.requester.org?.toLowerCase().includes(searchLower) || false;
    if (searchQuery && !titleMatch && !refMatch && !orgMatch) return false;

    if (orgFilter !== "All organizations") {
      const org = req.requester.org || req.client || "Organization not provided";
      if (org.toLowerCase() !== orgFilter.toLowerCase()) return false;
    }

    if (formatFilter !== "All formats") {
      const format = req.format || "Virtual";
      if (format !== formatFilter && !(formatFilter === "In Person" && format === "In person")) return false;
    }

    return matchesStatusFilter(asListed(req), statusFilter, currentTime);
  });

  const upcomingRequests = sortUpcomingWithHappeningNow(
    filteredRequests.filter((r) => isAppointmentUpcoming(r, currentTime)),
    currentTime,
  );
  const pastRequests = filteredRequests.filter((r) => !isAppointmentUpcoming(r, currentTime));
  const [activeTab, setActiveTab] = useListTab(statusFilter, { upcoming: upcomingRequests.length, past: pastRequests.length }, loaded);

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto max-w-[1200px] space-y-6 pt-2">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-[32px] font-semibold tracking-tight text-[var(--ink)]">Requests & assignments</h1>
          <p className="text-[15px] text-[var(--sage)]">Every appointment your agency is staffing</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => window.location.reload()} className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-slate-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="h-[18px] w-[18px]" />
          </button>
          <Link href="/requests/new" className="flex items-center h-11 rounded-full bg-[var(--forest)] px-6 text-[14px] font-medium text-[var(--canvas)] transition-opacity hover:opacity-90 whitespace-nowrap shrink-0">
            New request
          </Link>
        </div>
      </div>

      <p className="text-[15px] text-[var(--sage)] pt-3 pb-2">Back-to-back appointments are allowed. Travel time is not checked.</p>

      {/* Filters Group */}
      <div className="space-y-3">
        {/* Agency Input */}
        <div className="space-y-1.5 w-full">
          <label className="pl-5 text-[13px] font-medium text-[var(--sage)]">Agency</label>
          <div className="rounded-full bg-[#F3F2EE] px-6 py-3.5 text-[15px] text-slate-600 border border-neutral-200/50">{DEFAULT_AGENCY_NAME}</div>
        </div>

        {/* Search / Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pb-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Search title, organization, reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full bg-[#F3F2EE] px-6 py-3.5 text-[14px] text-slate-700 placeholder:text-[var(--sage)] border border-neutral-200/50 outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.3)]"
            />
          </div>
          <CustomSelect size="large" options={orgOptions} value={orgFilter} onChange={setOrgFilter} />
          <CustomSelect size="large" options={["All formats", "In Person", "Virtual", "Hybrid - In person and Virtual"]} value={formatFilter} onChange={setFormatFilter} />
          <CustomSelect size="large" options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={(value) => { if (isStatusFilter(value)) setStatusFilter(value); }} />
        </div>
      </div>

      {view.scope === "split" ? (
        <>
          {/* Tab toggle: same pill layout as the interpreter Jobs page */}
          <div className="bg-[#F5F4F0] p-1 rounded-full flex w-full mb-2">
            <TabButton tab="upcoming" active={activeTab === "upcoming"} count={upcomingRequests.length} onSelect={setActiveTab} />
            <TabButton tab="past" active={activeTab === "past"} count={pastRequests.length} onSelect={setActiveTab} />
          </div>
          {activeTab === "upcoming" ? (
            <ListSection title="Upcoming" note={view.upcomingNote} empty="No upcoming appointments match these filters." items={upcomingRequests} currentTime={currentTime} />
          ) : (
            <ListSection title="Past" note={view.pastNote} empty="No past appointments match these filters." items={pastRequests} currentTime={currentTime} />
          )}
        </>
      ) : (
        <ListSection
          title={`${statusFilter} · ${filteredRequests.length}`}
          note={view.note}
          empty={view.empty}
          items={view.scope === "upcoming" ? sortUpcomingWithHappeningNow(filteredRequests, currentTime) : filteredRequests}
          currentTime={currentTime}
        />
      )}
    </motion.div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading requests...</div>}>
      <RequestsPageContent />
    </Suspense>
  );
}
