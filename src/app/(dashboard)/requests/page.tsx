"use client";

import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRequests } from "@/context/RequestsContext";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Suspense } from "react";
import { RefreshCw, Building2, MapPin, Users2, ChevronDown } from "lucide-react";
import { getStaffingLabel, getStaffingRatio, getStatusFilters, formatReference } from "@/utils/statusEngine";
import { fetchLiveRequests } from "@/app/actions/getRequests";
import { isAppointmentHappeningNow, isAppointmentUpcoming, sortUpcomingWithHappeningNow } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { formatInTimeZone } from "date-fns-tz";
import { getIanaZone } from "@/utils/timezone";

function CustomSelect({ options, value, onChange }: { options: string[], value: string, onChange: (val: string) => void }) {
 const [isOpen, setIsOpen] = useState(false);
 const ref = useRef<HTMLDivElement>(null);

 useEffect(() => {
 function handleClickOutside(event: MouseEvent) {
 if (ref.current && !ref.current.contains(event.target as Node)) {
 setIsOpen(false);
 }
 }
 document.addEventListener("mousedown", handleClickOutside);
 return () => document.removeEventListener("mousedown", handleClickOutside);
 }, []);

 return (
 <div className="relative w-full" ref={ref}>
 <div 
 className={`flex items-center justify-between rounded-full bg-[#F3F2EE] px-6 py-3.5 cursor-pointer border transition-colors ${isOpen ? 'border-[#0B3B32] ring-1 ring-[#0B3B32]' : 'border-neutral-200/50'}`}
 onClick={() => setIsOpen(!isOpen)}
 >
 <span className="text-[14px] text-slate-700 truncate">{value}</span>
 <ChevronDown className={`h-4 w-4 text-[var(--sage)] shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
 </div>
 
 {isOpen && (
 <div className="absolute left-0 mt-1 w-full z-50 bg-[var(--canvas)] rounded-2xl border border-neutral-200/50 py-2 overflow-hidden">
 {options.map((option, idx) => (
 <div 
 key={idx}
 className={`px-4 py-2 text-[14px] cursor-pointer transition-colors ${value === option ? 'bg-blue-50/50 text-blue-800 font-medium' : 'text-gray-800 hover:bg-blue-600 hover:text-white'}`}
 onClick={() => {
 onChange(option);
 setIsOpen(false);
 }}
 >
 {option}
 </div>
 ))}
 </div>
 )}
 </div>
 );
}

// Helper to render the colored badges based on string
function StatusBadge({ status }: { status: string }) {
 if (status === "Offer awaiting response" || status === "Awaiting response") {
 return (
 <span className="rounded-full bg-[#EAE8F4] px-3 py-1 text-[11px] font-semibold text-[#544B84]">
 Offer awaiting response
 </span>
 );
 }
 if (status === "Unfilled / draft") {
 return (
 <span className="rounded-full bg-[#F4EBE0] px-3 py-1 text-[11px] font-semibold text-[#8B6A3E]">
 Unfilled / draft
 </span>
 );
 }
 if (status === "Cancelled") {
 return (
 <span className="rounded-full bg-[#FEF2F2] px-3 py-1 text-[11px] font-semibold text-[#991B1B] border border-[#FCA5A5]/30">
 Cancelled
 </span>
 );
 }
 if (status === "Fully staffed" || status === "Booked" || status === "Assigned") {
 return (
 <span className="rounded-full bg-[#E6EFEA] px-3 py-1 text-[11px] font-semibold text-[#385B52]">
 {status}
 </span>
 );
 }
 if (status === "Needs replacement") {
 return (
 <span className="rounded-full bg-[#FEF3C7] px-3 py-1 text-[11px] font-semibold text-[#92400E] border border-[#FDE68A]/60">
 Needs replacement
 </span>
 );
 }
 if (status === "Partially staffed") {
 return (
 <span className="rounded-full bg-[#E8F3EE] px-3 py-1 text-[11px] font-semibold text-[#466960]">
 Partially staffed
 </span>
 );
 }
 return (
 <span className="rounded-full bg-[#E9E4D6] px-3 py-1 text-[11px] font-semibold text-[#665D46]">
 {status}
 </span>
 );
}

const parseSafeDate = (dateVal: any) => {
  if (!dateVal) return null;
  let d = new Date(dateVal);
  if (!isNaN(d.getTime())) return d;
  if (typeof dateVal === 'string') {
    d = new Date(dateVal.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
    if (/^\d+$/.test(dateVal)) {
      d = new Date(parseInt(dateVal, 10));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
};

const formatJobDate = (startsAt?: string, endsAt?: string, timeZone?: string) => {
  if (!startsAt) return "Time not specified";
  try {
    const start = parseSafeDate(startsAt);
    if (!start) return "Time not specified";
    const safeZone = getIanaZone(timeZone);
    const end = parseSafeDate(endsAt);
    const dateStr = formatInTimeZone(start, safeZone, "EEE, MMM d");
    const timeStart = formatInTimeZone(start, safeZone, "h:mm a");
    const timeEnd = end
      ? formatInTimeZone(end, safeZone, "h:mm a zzz")
      : formatInTimeZone(start, safeZone, "h:mm a zzz");
    return `${dateStr} · ${timeStart} – ${timeEnd}`;
  } catch (e) {
    return "Time not specified";
  }
};

function RequestsPageContent() {
  const [requests, setRequests] = useState<any[]>([]);
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter");

  useEffect(() => {
    fetchLiveRequests().then(data => setRequests(data)).catch(() => console.error("[requests page] request failed"));
  }, []);

  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState("All organizations");
  const [formatFilter, setFormatFilter] = useState("All formats");

  let initialStatus = "Appointments";
  if (filterParam === "happening-now") initialStatus = "Happening now";
  else if (filterParam === "needing-coverage") initialStatus = "Needing coverage";
  else if (filterParam === "pending-offers") initialStatus = "Pending offers";
  else if (filterParam === "staff-follow-up") initialStatus = "Staff follow-up";
  else if (filterParam === "needs-replacement") initialStatus = "Needs replacement";
  else if (filterParam === "partially-staffed") initialStatus = "Partially staffed";

  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  const [interpreterJobs, setInterpreterJobs] = useState<any[]>([]);
  useEffect(() => {
    try {
      const storedJobs = JSON.parse(localStorage.getItem('terpdesk_interpreter_jobs') || '[]');
      setInterpreterJobs(storedJobs);
    } catch (e) {
      console.error("[requests page] operation failed");
    }
  }, []);

  const enrichedRequests = React.useMemo(() => {
    return requests.map(req => {
      const reqJobs = interpreterJobs.filter(j => j.id === req.id || j.requestId === req.id);
      const bookedJob = reqJobs.find(j => j.status === 'booked' || j.status === 'accepted');
      if (bookedJob) {
        return {
          ...req,
          status: req.status === 'Cancelled' ? 'Cancelled' : (req.status === 'booked' ? 'booked' : 'assigned'),
          hasAcceptedOffer: true,
          acceptedInterpretersCount: Math.max(req.acceptedInterpretersCount || 0, 1),
          assignedInterpreterName: bookedJob.interpreterName || 'Booked'
        };
      }
      return req;
    });
  }, [requests, interpreterJobs]);

  const orgOptions = useMemo(() => {
    const orgs = new Set<string>();
    enrichedRequests.forEach(req => {
      const org = req.requester?.org || req.data?.requester?.org || req.data?.client;
      if (org && typeof org === 'string' && org.trim()) {
        orgs.add(org.trim());
      }
    });
    return ["All organizations", ...Array.from(orgs).sort()];
  }, [enrichedRequests]);

  const filteredRequests = enrichedRequests.filter(req => {
    const searchLower = searchQuery.toLowerCase();
    const titleMatch = req.title.toLowerCase().includes(searchLower);
    const cleanRef = formatReference(req.id).toLowerCase();
    const refMatch = req.id.toLowerCase().includes(searchLower) || cleanRef.includes(searchLower);
    const orgMatch = req.requester?.org?.toLowerCase().includes(searchLower) || false;
 
    if (searchQuery && !titleMatch && !refMatch && !orgMatch) return false;
 
    if (orgFilter !== "All organizations") {
      const org = req.requester?.org || req.data?.requester?.org || req.data?.client || "Organization not provided";
      if (org.toLowerCase() !== orgFilter.toLowerCase()) return false;
    }
 
    if (formatFilter !== "All formats") {
      const format = req.details?.format || "Virtual";
      if (format !== formatFilter && !(formatFilter === "In Person" && format === "In person")) return false;
    }

    const filters = getStatusFilters(req as any);
  
    if (statusFilter === "Cancelled") return filters.isCancelled;
    if (filters.isCancelled) return false;
  
    if (statusFilter !== "Appointments") {
      if (statusFilter === "Happening now") return isAppointmentHappeningNow(req, currentTime);
      if (statusFilter === "Needing coverage") return filters.needingCoverage;
      if (statusFilter === "Pending offers") return filters.hasPendingOffer;
      if (statusFilter === "Partially staffed") return filters.partiallyStaffed || getStaffingLabel(req as any) === "Partially staffed";
      if (statusFilter === "Fully staffed") return filters.fullyStaffed;
      if (statusFilter === "Needs replacement") return filters.needsReplacement;
      if (statusFilter === "Staff follow-up") return filters.staffFollowUp;
      return false;
    }
  
    return true;
  });

  const upcomingRequests = sortUpcomingWithHappeningNow(
    filteredRequests.filter((r) => isAppointmentUpcoming(r, currentTime)),
    currentTime
  );
  const pastRequests = filteredRequests.filter((r) => !isAppointmentUpcoming(r, currentTime));

 return (
 <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto max-w-[1200px] space-y-6 pt-2">
 {/* Header Row */}
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div className="space-y-1.5">
 <h1 className="text-[32px] font-semibold tracking-tight text-[var(--ink)]">
 Requests & assignments
 </h1>
 <p className="text-[15px] text-[var(--sage)]">
 Upcoming appointments and unresolved past appointments
 </p>
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

 <p className="text-[15px] text-[var(--sage)] pt-3 pb-2">
 Back-to-back appointments are allowed. Travel time is not checked.
 </p>

 {/* Filters Group */}
  <div className="space-y-3">
  {/* Filter Pill */}
 <div className="rounded-full bg-[#F3F2EE] px-6 py-3.5 text-[15px] text-slate-600 w-full">
 Active filter: <span className="font-semibold text-[var(--ink)]">{statusFilter}</span>
 </div>

 {/* Agency Input */}
 <div className="space-y-1.5 w-full">
 <label className="pl-5 text-[13px] font-medium text-[var(--sage)]">Agency</label>
 <div className="rounded-full bg-[#F3F2EE] px-6 py-3.5 text-[15px] text-slate-600 border border-neutral-200/50">
 {DEFAULT_AGENCY_NAME}
 </div>
 </div>

 {/* Search / Filter Bar */}
 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pb-2">
 <div className="relative">
 <input 
 type="text" 
 placeholder="Search title, organization, reference..." 
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="w-full rounded-full bg-[#F3F2EE] px-6 py-3.5 text-[14px] text-slate-700 placeholder:text-[var(--sage)] border border-neutral-200/50 outline-none focus:ring-2 focus:ring-[#0B3B32]/30"
 />
 </div>
 <CustomSelect options={orgOptions} value={orgFilter} onChange={setOrgFilter} />
 <CustomSelect options={["All formats", "In Person", "Virtual", "Hybrid - In person and Virtual"]} value={formatFilter} onChange={setFormatFilter} />
 <CustomSelect options={["Appointments", "Happening now", "Needing coverage", "Needs replacement", "Pending offers", "Partially staffed", "Fully staffed", "Staff follow-up", "Cancelled"]} value={statusFilter} onChange={setStatusFilter} />
 </div>
 </div>

 <p className="text-[13px] text-[var(--sage)] font-medium pl-2 pb-2">{filteredRequests.length} appointments</p>

 {/* Tab toggle: same pill layout as the interpreter Jobs page */}
 <div className="bg-[#F5F4F0] p-1 rounded-full flex w-full mb-2">
 <button
 type="button"
 onClick={() => setActiveTab("upcoming")}
 className={`flex-1 text-[13px] font-medium py-2 rounded-full flex items-center justify-center gap-1.5 transition-all ${activeTab === "upcoming" ? "bg-[#163C3A] text-white shadow-sm" : "text-[var(--sage)] hover:text-gray-700"}`}
 >
 Upcoming <span className="font-normal opacity-80">{upcomingRequests.length}</span>
 </button>
 <button
 type="button"
 onClick={() => setActiveTab("past")}
 className={`flex-1 text-[13px] font-medium py-2 rounded-full flex items-center justify-center gap-1.5 transition-all ${activeTab === "past" ? "bg-[#163C3A] text-white shadow-sm" : "text-[var(--sage)] hover:text-gray-700"}`}
 >
 Past <span className="font-normal opacity-80">{pastRequests.length}</span>
 </button>
 </div>

 {/* UPCOMING SECTION */}
 {activeTab === 'upcoming' && (
 <div className="space-y-5 pb-8">
 <h2 className="text-[19px] font-semibold text-[var(--ink)] pl-1">Upcoming</h2>
 <div className="space-y-4">
 {upcomingRequests.length === 0 && <p className="text-[14px] text-[var(--sage)] pl-1">No upcoming requests match your filters.</p>}
 <AnimatedPaginatedList
 items={upcomingRequests}
 itemsPerPage={5}
 className="space-y-4"
 getKey={(req) => req.id}
 renderItem={(req) => {
 const org = req.requester?.org || "Organization not provided";
 const setting = req.setting || req.details?.setting || "Medical";
 const format = req.format || req.details?.format || (req.isVirtual ? "Virtual" : "In person");
 const location = req.location || req.onsite?.venue || (format.toLowerCase().includes('virtual') ? "Virtual" : "Location pending");
 const isCancelled = req.status === "Cancelled" || req.state === "cancelled";
 const { bookedCount, totalSlots, bookedSlots } = getStaffingRatio(req as any);
 const statusLabel = getStaffingLabel(req as any);
 let staffingText = isCancelled ? "0 of 0 staffed" : `${bookedCount} of ${totalSlots} staffed`;
 if (bookedSlots.length > 0) {
   staffingText += ` (${bookedSlots.map(s => s.interpreterName).join(', ')})`;
 }

 return (
 <Link
 href={`/requests/${req.id}`}
 key={req.id}
 className="block rounded-2xl border border-gray-200 bg-white p-5 border border-[#EBE8DF] hover:bg-gray-50 transition-colors cursor-pointer"
 >
 <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
 <div className="space-y-1">
 <h3 className="text-[17px] font-semibold text-[var(--ink)]">{req.title}</h3>
 <p className="text-[14px] text-[var(--sage)]">{formatJobDate(req.startsAt, req.endsAt, req.details?.timeZone || req.data?.details?.timeZone)}</p>
 </div>
 <div className="flex flex-row flex-wrap items-center justify-end gap-2">
 {isAppointmentHappeningNow(req, currentTime) && (
   <HappeningNowBadge size="sm" />
 )}
 <StatusBadge status={statusLabel} />
 </div>
 </div>

 <div className="mt-4 flex flex-col md:flex-row gap-3 justify-between">
 {/* Col 1 */}
 <div className="flex items-start gap-3 w-full md:w-1/3">
 <Building2 className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
 <div className="flex flex-col gap-1">
 <span className="text-[13px] text-[var(--sage)]">{org}</span>
 <span className="text-[13px] text-slate-400">{setting}</span>
 </div>
 </div>
 {/* Col 2 */}
 <div className="flex items-start gap-3 w-full md:w-1/3">
 <MapPin className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
 <div className="flex flex-col gap-1">
 <span className="text-[13px] text-[var(--sage)]">
 {format} · {location}
 </span>
 <span className="text-[13px] text-slate-400 font-medium">{req.data?.intake?.odhhSrn ? `SRN: ${req.data.intake.odhhSrn}` : formatReference(req.id)}</span>
 </div>
 </div>
 {/* Col 3 */}
 <div className="flex items-start gap-3 w-full md:w-1/3">
 <Users2 className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
 <div className="flex flex-col gap-1">
 <span className="text-[13px] text-[var(--sage)]">{staffingText}</span>
 </div>
 </div>
 </div>
 </Link>
 )}}
 />
 </div>
 </div>
 )}

 {/* PAST SECTION */}
 {activeTab === 'past' && (
 <div className="space-y-5 pb-12">
 <div className="space-y-1 pl-1">
 <h2 className="text-[19px] font-semibold text-[var(--ink)]">Past — unresolved</h2>
 <p className="text-[14px] text-[var(--sage)]">
 These appointments still need coverage, an offer response, or access follow-up.
 </p>
 </div>
 
 <div className="space-y-4">
 {pastRequests.length === 0 && <p className="text-[14px] text-[var(--sage)] pl-1">No past requests match your filters.</p>}
 <AnimatedPaginatedList
 items={pastRequests}
 itemsPerPage={5}
 className="space-y-4"
 getKey={(req) => req.id}
 renderItem={(req) => {
 const org = req.requester?.org || "Organization not provided";
 const setting = req.setting || req.details?.setting || "Medical";
 const format = req.format || req.details?.format || (req.isVirtual ? "Virtual" : "In person");
 const location = req.location || req.onsite?.venue || (format.toLowerCase().includes('virtual') ? "Virtual" : "Location pending");
 const isCancelled = req.status === "Cancelled" || req.state === "cancelled";
 const { bookedCount, totalSlots, bookedSlots } = getStaffingRatio(req as any);
 const statusLabel = getStaffingLabel(req as any);
 let staffingText = isCancelled ? "0 of 0 staffed" : `${bookedCount} of ${totalSlots} staffed`;
 if (bookedSlots.length > 0) {
   staffingText += ` (${bookedSlots.map(s => s.interpreterName).join(', ')})`;
 }

 return (
 <Link
 href={`/requests/${req.id}`}
 key={req.id}
 className="block rounded-2xl border border-gray-200 bg-white p-5 border border-[#EBE8DF] hover:bg-gray-50 transition-colors cursor-pointer"
 >
 <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
 <div className="space-y-1">
 <h3 className="text-[17px] font-semibold text-[var(--ink)]">{req.title}</h3>
 <p className="text-[14px] text-[var(--sage)]">{formatJobDate(req.startsAt, req.endsAt, req.details?.timeZone || req.data?.details?.timeZone)}</p>
 </div>
 <div className="flex items-center gap-2">
 <StatusBadge status={statusLabel} />
 </div>
 </div>

 <div className="mt-4 flex flex-col md:flex-row gap-3 justify-between">
 {/* Col 1 */}
 <div className="flex items-start gap-3 w-full md:w-1/3">
 <Building2 className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
 <div className="flex flex-col gap-1">
 <span className="text-[13px] text-[var(--sage)]">{org}</span>
 <span className="text-[13px] text-slate-400">{setting}</span>
 </div>
 </div>
 {/* Col 2 */}
 <div className="flex items-start gap-3 w-full md:w-1/3">
 <MapPin className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
 <div className="flex flex-col gap-1">
 <span className="text-[13px] text-[var(--sage)]">
 {format} · {location}
 </span>
 <span className="text-[13px] text-slate-400 font-medium">{req.data?.intake?.odhhSrn ? `SRN: ${req.data.intake.odhhSrn}` : formatReference(req.id)}</span>
 </div>
 </div>
 {/* Col 3 */}
 <div className="flex items-start gap-3 w-full md:w-1/3">
 <Users2 className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
 <div className="flex flex-col gap-1">
 <span className="text-[13px] text-[var(--sage)]">{staffingText}</span>
 </div>
 </div>
 </div>
 </Link>
 )}}
 />
 </div>
 </div>
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
