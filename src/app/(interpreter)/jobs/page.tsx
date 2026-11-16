"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { HoursOverdueBanner } from "@/components/interpreter/HoursOverdueBanner";
import { CancelledJobCard } from "@/components/interpreter/jobs/CancelledJobCard";
import { CompletedJobCard } from "@/components/interpreter/jobs/CompletedJobCard";
import { UpcomingJobCard } from "@/components/interpreter/jobs/UpcomingJobCard";
import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import { useInterpreterJobs } from "@/context/InterpreterJobsContext";
import type { Job } from "@/context/InterpreterJobsContext";
import { useServiceRecords } from "@/hooks/useServiceRecords";
import type { ServiceRecord } from "@/hooks/useServiceRecords";
import { bucketInterpreterJobs } from "@/lib/interpreterJobBuckets";
import { getJobHoursState } from "@/utils/hoursState";
import type { HoursWorkflowState } from "@/utils/hoursState";

type Tab = "upcoming" | "completed" | "cancelled";

const TABS: { id: Tab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

const HOURS_FILTERS = ["All completed", "Needs hours", "Submitted", "Changes requested", "Approved"] as const;
type HoursFilter = (typeof HOURS_FILTERS)[number];
const FILTER_STATES: Record<Exclude<HoursFilter, "All completed">, HoursWorkflowState[]> = {
  "Needs hours": ["not_submitted", "draft"],
  Submitted: ["awaiting_review"],
  "Changes requested": ["correction_requested"],
  Approved: ["approved"],
};

/** ?tab= and ?filter= from links elsewhere (home's "Hours to submit" sends tab=past&filter=needs_hours). */
function readLinkParams(): { tab: Tab | null; filter: HoursFilter | null } {
  const params = new URLSearchParams(window.location.search);
  const rawTab = params.get("tab");
  const tab: Tab | null = rawTab === "past" || rawTab === "completed" ? "completed" : rawTab === "cancelled" ? "cancelled" : rawTab === "upcoming" ? "upcoming" : null;
  const raw = (params.get("filter") ?? "").toLowerCase().replace(/[-_]/g, " ");
  const filter: HoursFilter | null = !raw ? null
    : raw.includes("need") ? "Needs hours"
    : raw.includes("submit") ? "Submitted"
    : raw.includes("change") || raw.includes("correct") ? "Changes requested"
    : raw.includes("approv") ? "Approved"
    : "All completed";
  return { tab: tab ?? (filter ? "completed" : null), filter };
}

const filterCompleted = (jobs: Job[], filter: HoursFilter, records: ServiceRecord[]): Job[] =>
  filter === "All completed" ? jobs : jobs.filter((job) => FILTER_STATES[filter].includes(getJobHoursState(job, records)));

export default function InterpreterJobsPage() {
  const { jobs, refreshJobs } = useInterpreterJobs();
  const { records, reload } = useServiceRecords();
  const [now, setNow] = useState<number>(() => Date.now());
  const [tab, setTab] = useState<Tab>("upcoming");
  const [hoursFilter, setHoursFilter] = useState<HoursFilter>("All completed");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const { tab: linkedTab, filter } = readLinkParams();
    if (linkedTab) setTab(linkedTab);
    if (filter) setHoursFilter(filter);
  }, []);

  const buckets = bucketInterpreterJobs(jobs, now);
  const counts: Record<Tab, number> = { upcoming: buckets.upcoming.length, completed: buckets.completed.length, cancelled: buckets.cancelled.length };
  const completedShown = filterCompleted(buckets.completed, hoursFilter, records);

  const refresh = () => {
    void refreshJobs();
    reload();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-[1200px] mx-auto p-4 md:p-8 w-full pb-24 antialiased">
      <HoursOverdueBanner />

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 pt-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)] mb-2">Jobs</h1>
          <p className="text-[var(--sage)] text-[15px]">Your offers and bookings, and where your hours stand.</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          title="Refresh jobs & hours"
          aria-label="Refresh jobs and hours"
          className="flex items-center justify-center p-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <p className="text-sm text-[var(--sage)] my-4">
        {counts.upcoming} upcoming {counts.upcoming === 1 ? "appointment" : "appointments"}
      </p>

      <div role="tablist" aria-label="Jobs" className="bg-[#F5F4F0] p-1 rounded-full flex w-full mb-8">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 text-[13px] font-medium py-2 rounded-full flex items-center justify-center gap-1.5 transition-all ${tab === id ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--sage)] hover:text-gray-700"}`}
          >
            {label} <span className="font-normal opacity-70">{counts[id]}</span>
          </button>
        ))}
      </div>

      {tab === "upcoming" && (
        buckets.upcoming.length === 0 ? (
          <p className="bg-white rounded-2xl border border-gray-200 p-6 text-[14px] text-[var(--sage)]">No upcoming offers or bookings right now.</p>
        ) : (
          <AnimatedPaginatedList
            items={buckets.upcoming}
            itemsPerPage={10}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
            getKey={(job) => job.id}
            renderItem={(job) => <UpcomingJobCard job={job} now={now} serviceRecords={records} />}
          />
        )
      )}

      {tab === "completed" && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {HOURS_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setHoursFilter(filter)}
                className={`text-[13px] font-medium px-4 py-2 rounded-full transition-colors cursor-pointer ${hoursFilter === filter ? "bg-[#1C3F36] text-white shadow-sm" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}
              >
                {filter}
              </button>
            ))}
          </div>
          <p className="text-sm text-[var(--sage)] mb-6">
            A past date does not mean the service was approved. Reported hours stay in their own state until the agency reviews them.
          </p>
          {completedShown.length === 0 ? (
            <p className="bg-white rounded-2xl border border-gray-200 p-6 text-[14px] text-[var(--sage)]">No completed jobs are in &ldquo;{hoursFilter}&rdquo; right now.</p>
          ) : (
            <AnimatedPaginatedList
              key={hoursFilter}
              items={completedShown}
              itemsPerPage={10}
              className="grid grid-cols-1 md:grid-cols-2 gap-3"
              getKey={(job) => job.id}
              renderItem={(job) => <CompletedJobCard job={job} serviceRecords={records} />}
            />
          )}
        </div>
      )}

      {tab === "cancelled" && (
        buckets.cancelled.length === 0 ? (
          <p className="bg-white rounded-2xl border border-gray-200 p-6 text-[14px] text-[var(--sage)]">No cancelled appointments.</p>
        ) : (
          <AnimatedPaginatedList
            items={buckets.cancelled}
            itemsPerPage={10}
            className="flex flex-col gap-3"
            getKey={(job) => job.id}
            renderItem={(job) => <CancelledJobCard job={job} />}
          />
        )
      )}
    </motion.div>
  );
}
