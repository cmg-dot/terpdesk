"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { RefreshCw, MapPin } from "lucide-react";
import { useInterpreterJobs } from "@/context/InterpreterJobsContext";
import { useGlobalState } from "@/context/GlobalContext";
import { motion } from "framer-motion";
import { fetchInterpreterOffers } from "@/app/actions/getInterpreterOffers";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { isAppointmentHappeningNow, isAppointmentUpcoming, sortUpcomingWithHappeningNow } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import { getJobHoursState, getHoursBadgeInfo } from "@/utils/hoursState";

type Tab = "upcoming" | "past";

export default function InterpreterJobsPage() {
  const { jobs } = useInterpreterJobs();
  
  const { currentUser } = useGlobalState();
  const [offers, setOffers] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  const [serviceRecords, setServiceRecords] = useState<any[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const loadServiceRecords = () => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('terpdesk_service_records');
      if (stored) {
        try {
          setServiceRecords(JSON.parse(stored));
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  useEffect(() => {
    loadServiceRecords();
    window.addEventListener('storage', loadServiceRecords);
    return () => window.removeEventListener('storage', loadServiceRecords);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'past' || tabParam === 'upcoming') {
        setActiveTab(tabParam as Tab);
      }
      const filterParam = params.get('filter');
      if (filterParam) {
        const lower = filterParam.toLowerCase().replace(/[-_]/g, ' ');
        if (lower.includes('need')) {
          setPastFilter('Needs hours');
        } else if (lower.includes('submit')) {
          setPastFilter('Submitted');
        } else if (lower.includes('change') || lower.includes('correct')) {
          setPastFilter('Changes requested');
        } else if (lower.includes('approv')) {
          setPastFilter('Approved');
        } else if (lower.includes('all')) {
          setPastFilter('All past jobs');
        } else {
          setPastFilter(filterParam);
        }
      }
    }
  }, []);

  const refreshOffers = () => {
    if (currentUser?.email) {
      fetchInterpreterOffers(currentUser.email).then(data => {
        setOffers(data);
      }).catch(console.error);
    }
    loadServiceRecords();
  };

  useEffect(() => {
    refreshOffers();
  }, [currentUser?.email]);

  const [activeTab, setActiveTab] = useState<Tab>("upcoming");
  const [pastFilter, setPastFilter] = useState("All past jobs");

  const upcomingBooked = jobs.filter(job => job.status === 'booked' && isAppointmentUpcoming(job, currentTime));
  const upcomingOffers = offers.filter(o => o.status === 'pending');
  const upcomingJobs = sortUpcomingWithHappeningNow([...upcomingOffers, ...upcomingBooked], currentTime);
  const declinedReleasedJobs = jobs.filter(job => job.status === 'declined' || job.status === 'released');
  
  const upcomingCount = upcomingJobs.length;
  
  // Compute past booked jobs (only jobs whose endsAt has passed)
  const pastBookedJobs = jobs.filter(j => j.status === 'booked' && !isAppointmentUpcoming(j, currentTime));
  let displayedPastJobs: any[] = [];
  
  if (pastFilter === "Needs hours") {
    displayedPastJobs = pastBookedJobs.filter(j => {
      const state = getJobHoursState(j, serviceRecords);
      return state === 'not_submitted' || state === 'draft';
    });
  } else if (pastFilter === "Submitted") {
    displayedPastJobs = pastBookedJobs.filter(j => {
      const state = getJobHoursState(j, serviceRecords);
      return state === 'awaiting_review';
    });
  } else if (pastFilter === "Changes requested") {
    displayedPastJobs = pastBookedJobs.filter(j => {
      const state = getJobHoursState(j, serviceRecords);
      return state === 'correction_requested';
    });
  } else if (pastFilter === "Approved") {
    displayedPastJobs = pastBookedJobs.filter(j => {
      const state = getJobHoursState(j, serviceRecords);
      return state === 'approved';
    });
  } else {
    // "All past jobs"
    displayedPastJobs = pastBookedJobs;
  }

  const pastCount = pastBookedJobs.length + declinedReleasedJobs.length;
  const totalCount = upcomingCount + pastCount;

  const mapSafeZone = (tz: any) => {
    if (!tz || typeof tz !== 'string') return 'America/Los_Angeles';
    const lower = tz.toLowerCase();
    if (lower.includes('hawaii')) return 'Pacific/Honolulu';
    if (lower.includes('alaska')) return 'America/Anchorage';
    if (lower.includes('pacific')) return 'America/Los_Angeles';
    if (lower.includes('arizona')) return 'America/Phoenix';
    if (lower.includes('mountain')) return 'America/Denver';
    if (lower.includes('central')) return 'America/Chicago';
    if (lower.includes('eastern')) return 'America/New_York';
    return 'America/Los_Angeles';
  };

  const formatJobDate = (startStr?: string | Date | null, endStr?: string | Date | null, timeZone?: string) => {
    try {
      if (!startStr) return "Date TBD";
      const start = new Date(startStr);
      if (isNaN(start.getTime())) return "Date TBD";
      const safeZone = mapSafeZone(timeZone);
      
      const end = endStr ? new Date(endStr) : null;
      const dateStr = formatInTimeZone(start, safeZone, "EEE, MMM d").toUpperCase();
      const timeStart = formatInTimeZone(start, safeZone, "h:mm a");
      const timeEnd = end && !isNaN(end.getTime()) 
        ? formatInTimeZone(end, safeZone, "h:mm a zzz") 
        : formatInTimeZone(start, safeZone, "h:mm a zzz");
      
      return `${dateStr} · ${timeStart} - ${timeEnd}`;
    } catch (error) {
      return "Date TBD";
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-[1200px] mx-auto p-4 md:p-8 w-full pb-24 antialiased">
    
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 pt-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)] mb-2">
            Jobs
          </h1>
          <p className="text-[var(--sage)] text-[15px]">
            Shared appointments, offers and reserved interpreter positions.
          </p>
        </div>
        <button 
          onClick={refreshOffers}
          title="Refresh jobs & hours"
          className="flex items-center justify-center p-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="w-full mb-4">
        <input 
          type="text" 
          placeholder="Search jobs, locations and settings..." 
          className="w-full bg-[#F5F4F0] border-none rounded-full px-6 py-3.5 text-[14px] text-[var(--ink)] placeholder:text-[var(--sage)] focus:outline-none focus:ring-2 focus:ring-[#1B433C]/20 transition-all"
        />
      </div>

      {/* Count Text */}
      <p className="text-sm text-[var(--sage)] my-4">{totalCount} appointments</p>

      {/* Toggle Bar */}
      <div className="bg-[#F5F4F0] p-1 rounded-full flex w-full mb-8">
        <button 
          onClick={() => setActiveTab("upcoming")}
          className={`flex-1 text-[13px] font-medium py-2 rounded-full flex items-center justify-center gap-1.5 transition-all ${activeTab === "upcoming" ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--sage)] hover:text-gray-700"}`}
        >
          Upcoming <span className={activeTab === "upcoming" ? "text-[var(--sage)] font-normal" : "font-normal opacity-70"}>{upcomingCount}</span>
        </button>
        <button 
          onClick={() => setActiveTab("past")}
          className={`flex-1 text-[13px] font-medium py-2 rounded-full flex items-center justify-center gap-1.5 transition-all ${activeTab === "past" ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--sage)] hover:text-gray-700"}`}
        >
          Past jobs <span className={activeTab === "past" ? "text-[var(--sage)] font-normal" : "font-normal opacity-70"}>{pastCount}</span>
        </button>
      </div>

      {/* Conditional View: Upcoming */}
      {activeTab === "upcoming" && (
        <div>
          <h2 className="text-xl font-semibold text-[var(--ink)] mt-8 mb-4">Upcoming</h2>
          <AnimatedPaginatedList
            items={upcomingJobs}
            itemsPerPage={10}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
            getKey={(job) => job.id}
            renderItem={(job) => {
              const isOffer = job.status === 'pending';
              const locationText = isOffer ? (job.location || job.agencyName) : job.location;
              const locPrimary = (locationText?.split('·')[0]?.trim() || locationText) || (job.isVirtual ? "Virtual" : "Location pending");
              const locSecondary = locationText?.split('·')[1]?.trim() || (job.isVirtual ? "Remote / Video" : (job.agencyName || "North Fictional Interpreting"));
              const startStr = job.startsAt || ((job as any).details?.startDate ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}` : undefined);
              const endStr = job.endsAt || ((job as any).details?.endDate ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}` : undefined);
              const tz = (job as any).details?.timeZone || job.timeZone;
              const dateText = startStr ? formatJobDate(startStr, endStr, tz) : job.dateString;
              
              const isHappening = isAppointmentHappeningNow(job, currentTime);
              const hoursState = getJobHoursState(job, serviceRecords);
              const badgeInfo = getHoursBadgeInfo(hoursState);
              
              return (
                <Link key={job.id} href={`/jobs/${job.id}`} className={`block bg-white rounded-2xl border p-4 hover:shadow-md transition-all ${isHappening ? 'border-emerald-500/60 ring-2 ring-emerald-500/10' : hoursState === 'correction_requested' ? 'border-amber-300 ring-1 ring-amber-300/30' : 'border-gray-200'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-1">
                    <div className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase leading-6">
                      {dateText}
                    </div>
                    <div className="flex flex-row flex-wrap items-center justify-end gap-2">
                      {isHappening && (
                        <HappeningNowBadge size="sm" className="h-6" />
                      )}
                      {job.status === 'pending' && (
                        <div className="inline-flex h-6 items-center bg-[#F5F3FF] text-[#6D28D9] text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0">
                          Offer received
                        </div>
                      )}
                      {job.status === 'booked' && (
                        <div className="inline-flex h-6 items-center bg-[#E2EBE5] text-[#1B433C] text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0">
                          Booked
                        </div>
                      )}
                      {hoursState === 'correction_requested' && (
                        <span className={`inline-flex h-6 items-center text-[11px] px-2.5 rounded-full whitespace-nowrap ${badgeInfo.badgeClass}`}>
                          {badgeInfo.label}
                        </span>
                      )}
                      {job.hasAutoFill && (
                        <div className="inline-flex h-6 items-center bg-[#FCE8E6] text-[#A0522D] text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0">
                          Auto Fill
                        </div>
                      )}
                    </div>
                  </div>
                  <h3 className="text-base font-semibold text-[var(--ink)] my-1.5 leading-snug">
                    {job.title}
                  </h3>
                  <div className="flex items-start gap-2 mb-2.5">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                    <div className="text-[13px] leading-snug">
                      <span className="text-[var(--ink)] block">{locPrimary}</span>
                      <span className="text-[var(--sage)]">{locSecondary}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full">
                      {job.setting || (job as any).details?.setting || "Medical"}
                    </span>
                    <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full">
                      {job.isVirtual ? "Virtual" : (job.format || (job as any).details?.format || "In person")}
                    </span>
                  </div>
                </Link>
              );
            }}
          />
        </div>
      )}

      {/* Conditional View: Past Jobs */}
      {activeTab === "past" && (
        <div>
          
          {/* A. Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 mb-8">
            {["All past jobs", "Needs hours", "Submitted", "Changes requested", "Approved"].map((filter) => (
              <button 
                key={filter}
                onClick={() => setPastFilter(filter)}
                className={`text-[13px] font-medium px-4 py-2 rounded-full transition-colors cursor-pointer ${
                  pastFilter === filter 
                    ? "bg-[#1C3F36] text-white shadow-sm" 
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* B. Past Jobs Section */}
          <h2 className="text-2xl font-bold text-[var(--ink)] mb-2">Past jobs</h2>
          <p className="text-sm text-[var(--sage)] mb-6">
            A past date does not mean the service was completed or approved. Reported hours stay in their own state until an agency reviews them.
          </p>

          {/* C. Dynamic Grid vs Empty State */}
          {displayedPastJobs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-12">
              <p className="text-[14px] text-[var(--sage)]">
                No past jobs are in "{pastFilter}" right now.
              </p>
            </div>
          ) : (
            <div className="mb-12">
            <AnimatedPaginatedList
              key={pastFilter}
              items={displayedPastJobs}
              itemsPerPage={10}
              className="grid grid-cols-1 md:grid-cols-2 gap-3"
              getKey={(job) => job.id}
              renderItem={(job) => {
                const locationParts = (job.location || '').split('·');
                const locPrimary = locationParts[0]?.trim() || "Location pending";
                const locSecondary = locationParts[1]?.trim() || job.agencyName || "North Fictional Interpreting";
                const hoursState = getJobHoursState(job, serviceRecords);
                const isCorrection = hoursState === 'correction_requested';
                const record = serviceRecords.find((r: any) => r.appointmentId === job.id || r.appointmentId === job.requestId);
                const reviewMsg = record?.reviewMessage || (job.hoursSubmission as any)?.reviewMessage;
                
                return (
                  <div 
                    key={job.id} 
                    className={`bg-white rounded-2xl border p-4 flex flex-col justify-between hover:shadow-md transition-shadow ${
                      isCorrection 
                        ? 'border-amber-300 ring-1 ring-amber-300/30' 
                        : 'border-gray-200'
                    }`}
                  >
                    <div>
                      {/* Top Row: Date on left, pills on right */}
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-1">
                        <div className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase leading-6">
                          {(() => {
                             const startStr = job.startsAt || ((job as any).details?.startDate ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}` : undefined);
                             const endStr = job.endsAt || ((job as any).details?.endDate ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}` : undefined);
                             const tz = (job as any).details?.timeZone || job.timeZone;
                             return startStr ? formatJobDate(startStr, endStr, tz) : job.dateString;
                          })()}
                        </div>
                        <div className="flex flex-row flex-wrap items-center justify-end gap-2">
                          <div className="inline-flex h-6 items-center bg-[#DCEAE3] text-[#1B433C] text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0">
                            Booked
                          </div>
                          {hoursState === 'not_submitted' || hoursState === 'draft' ? (
                            <div className="inline-flex h-6 items-center bg-[#F6EFE9] text-[#78350F] border border-[#EADBCE] text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0">
                              Submit actual hours
                            </div>
                          ) : hoursState === 'correction_requested' ? (
                            <div className="inline-flex h-6 items-center bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-semibold px-2.5 rounded-full whitespace-nowrap shrink-0">
                              Changes requested
                            </div>
                          ) : hoursState === 'awaiting_review' ? (
                            <div className="inline-flex h-6 items-center bg-purple-100 text-purple-800 text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0">
                              Submitted
                            </div>
                          ) : hoursState === 'approved' ? (
                            <div className="inline-flex h-6 items-center bg-emerald-100 text-emerald-800 text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0">
                              Approved
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {/* Appointment Title */}
                      <h3 className="text-base font-bold text-[var(--ink)] my-1.5 leading-snug">
                        {job.title}
                      </h3>

                      {/* Location & Agency */}
                      <div className="flex items-start gap-2 mb-2">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                        <div className="text-[13px] leading-snug">
                          <span className="text-[var(--ink)] block font-normal">{locPrimary}</span>
                          <span className="text-[var(--sage)] text-[13px]">{locSecondary}</span>
                        </div>
                      </div>

                      {/* Agency feedback comment if present */}
                      {isCorrection && reviewMsg && (
                        <div className="mb-2.5 text-xs text-amber-900 bg-amber-50 rounded-lg p-2.5 border border-amber-200">
                          <span className="font-semibold">Agency correction request: </span>"{reviewMsg}"
                        </div>
                      )}

                      {/* Setting and format pills */}
                      <div className="flex flex-wrap gap-1.5 my-2.5">
                        <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full bg-white">
                          {job.setting || (job as any).details?.setting || "Medical"}
                        </span>
                        <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full bg-white">
                          {job.isVirtual ? "Virtual" : "In person"}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Action Button */}
                    <Link
                      href={`/jobs/${job.id}`}
                      className="w-full mt-1 py-2 rounded-full text-center text-sm font-semibold text-white bg-[#1C3F36] hover:bg-[#153029] transition-colors block shadow-sm"
                    >
                      {hoursState === 'not_submitted' || hoursState === 'draft' || hoursState === 'correction_requested'
                        ? "Submit actual hours"
                        : "View reported hours"}
                    </Link>
                  </div>
                );
              }}
            />
            </div>
          )}

          {/* D. Assignments You No Longer Hold */}
          <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">Assignments you no longer hold</h2>
          <div>
            
            {declinedReleasedJobs.length === 0 ? (
               <p className="text-sm text-[var(--sage)]">No released or declined assignments.</p>
            ) : (
               <AnimatedPaginatedList
                 items={declinedReleasedJobs}
                 itemsPerPage={5}
                 className="flex flex-col gap-3"
                 getKey={(job) => job.id}
                 renderItem={(job) => (
                 <div className="bg-white rounded-2xl border border-gray-200 p-4 w-full">
                   <h3 className="font-semibold text-[var(--ink)] mb-1">{job.title}</h3>
                   <p className="text-sm text-[var(--sage)] mb-3">
                     {(() => {
                        const startStr = job.startsAt || ((job as any).details?.startDate ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}` : undefined);
                        const endStr = job.endsAt || ((job as any).details?.endDate ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}` : undefined);
                        const tz = (job as any).details?.timeZone || job.timeZone;
                        return startStr ? formatJobDate(startStr, endStr, tz) : job.dateString;
                     })()} · {job.location}
                   </p>
                   <p className="text-[14px] text-gray-800 mb-2">
                     {job.status === 'declined' ? 'You declined this offer.' : 'You gave this assignment back.'}
                   </p>
                   <p className="text-xs text-gray-400">Job details and prep materials are no longer available to you.</p>
                 </div>
                 )}
               />
            )}
            
          </div>
        </div>
      )}

    </motion.div>
  );
}
