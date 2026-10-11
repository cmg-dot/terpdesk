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

  useEffect(() => {
    if (currentUser?.email) {
      fetchInterpreterOffers(currentUser.email).then(data => {
        setOffers(data);
      }).catch(console.error);
    }
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
      const record = serviceRecords.find(r => r.appointmentId === j.id);
      return !record || (record.state !== 'submitted' && record.state !== 'approved');
    });
  } else if (pastFilter === "Submitted") {
    displayedPastJobs = pastBookedJobs.filter(j => {
      const record = serviceRecords.find(r => r.appointmentId === j.id);
      return record && record.state === 'submitted';
    });
  } else if (pastFilter === "Changes requested") {
    displayedPastJobs = pastBookedJobs.filter(j => {
      const record = serviceRecords.find(r => r.appointmentId === j.id);
      return record && record.state === 'changes_requested';
    });
  } else if (pastFilter === "Approved") {
    displayedPastJobs = pastBookedJobs.filter(j => {
      const record = serviceRecords.find(r => r.appointmentId === j.id);
      return record && record.state === 'approved';
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
        <button className="flex items-center justify-center p-2.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors shrink-0">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingJobs.map((job) => {
              const isOffer = job.status === 'pending';
              const locationText = isOffer ? job.agencyName : job.location;
              const locPrimary = locationText?.split('·')[0]?.trim() || locationText;
              const locSecondary = locationText?.split('·')[1]?.trim();
              const startStr = job.startsAt || ((job as any).details?.startDate ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}` : undefined);
              const endStr = job.endsAt || ((job as any).details?.endDate ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}` : undefined);
              const tz = (job as any).details?.timeZone || job.timeZone;
              const dateText = startStr ? formatJobDate(startStr, endStr, tz) : job.dateString;
              
              const isHappening = isAppointmentHappeningNow(job, currentTime);
              
              return (
                <Link key={job.id} href={`/jobs/${job.id}`} className={`block bg-white rounded-2xl border p-6 hover:shadow-md transition-all ${isHappening ? 'border-emerald-500/60 ring-2 ring-emerald-500/10' : 'border-gray-200'}`}>
                  <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-2">
                    <div className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase mt-1">
                      {dateText}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {isHappening && (
                        <HappeningNowBadge />
                      )}
                      {job.status === 'pending' && (
                        <div className="bg-[#F5F3FF] text-[#6D28D9] text-[12px] font-medium px-3 py-1 rounded-full w-max shrink-0">
                          Offer received
                        </div>
                      )}
                      {job.status === 'booked' && (
                        <div className="bg-[#E2EBE5] text-[#1B433C] text-[12px] font-medium px-3 py-1 rounded-full w-max shrink-0">
                          Booked
                        </div>
                      )}
                      {job.hasAutoFill && (
                        <div className="bg-[#FCE8E6] text-[#A0522D] text-[12px] font-medium px-3 py-1 rounded-full w-max shrink-0">
                          Auto Fill
                        </div>
                      )}
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--ink)] my-2">
                    {job.title}
                  </h3>
                  <div className="flex items-start gap-2 mb-4">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                    <div className="text-[14px]">
                      <span className="text-[var(--ink)] block">{locPrimary}</span>
                      <span className="text-[var(--sage)]">{locSecondary}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <span className="text-[12px] font-medium text-gray-600 border border-gray-200 px-3 py-1 rounded-full">Setting pending</span>
                    {job.isVirtual && (
                      <span className="text-[12px] font-medium text-gray-600 border border-gray-200 px-3 py-1 rounded-full">Virtual</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
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
                className={`text-[13px] font-medium px-4 py-2 rounded-full transition-colors ${
                  pastFilter === filter 
                    ? "bg-[#1B433C] text-white" 
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* B. Past Jobs Section */}
          <h2 className="text-xl font-semibold text-[var(--ink)] mb-2">Past jobs</h2>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
              {displayedPastJobs.map(job => {
                const locPrimary = job.location?.split('·')[0]?.trim() || job.location;
                const locSecondary = job.location?.split('·')[1]?.trim();
                
                return (
                  <Link key={job.id} href={`/jobs/${job.id}`} className="block bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                    <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-2">
                      <div className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase mt-1">
                        {(() => {
                           const startStr = job.startsAt || ((job as any).details?.startDate ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}` : undefined);
                           const endStr = job.endsAt || ((job as any).details?.endDate ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}` : undefined);
                           const tz = (job as any).details?.timeZone || job.timeZone;
                           return startStr ? formatJobDate(startStr, endStr, tz) : job.dateString;
                        })()}
                      </div>
                      <div className="flex gap-2">
                        <div className="bg-[#E2EBE5] text-[#1B433C] text-[12px] font-medium px-3 py-1 rounded-full w-max shrink-0">
                          Booked
                        </div>
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--ink)] my-2">
                      {job.title}
                    </h3>
                    <div className="flex items-start gap-2 mb-4">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                      <div className="text-[14px]">
                        <span className="text-[var(--ink)] block">{locPrimary}</span>
                        <span className="text-[var(--sage)]">{locSecondary}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4">
                      <span className="text-[12px] font-medium text-gray-600 border border-gray-200 px-3 py-1 rounded-full">Setting pending</span>
                      {job.isVirtual && (
                        <span className="text-[12px] font-medium text-gray-600 border border-gray-200 px-3 py-1 rounded-full">Virtual</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* D. Assignments You No Longer Hold */}
          <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">Assignments you no longer hold</h2>
          <div className="flex flex-col gap-4">
            
            {declinedReleasedJobs.length === 0 ? (
               <p className="text-sm text-[var(--sage)]">No released or declined assignments.</p>
            ) : (
               declinedReleasedJobs.map(job => (
                 <div key={job.id} className="bg-white rounded-2xl border border-gray-200 p-6 w-full">
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
               ))
            )}
            
          </div>
        </div>
      )}

    </motion.div>
  );
}
