"use client";
import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import React from "react";
import Link from "next/link";
import { useRequests } from "@/context/RequestsContext";
import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { getStatusFilters, getStaffingLabel, getStaffingRatio } from "@/utils/statusEngine";
import { fetchLiveRequests } from "@/app/actions/getRequests";
import { getSubmittedTimesheets } from "@/app/actions/getSubmittedTimesheets";
import type { SubmittedTimesheet } from "@/app/actions/getSubmittedTimesheets";
import { isAwaitingReview, mergeHoursRecords } from "@/utils/hoursReviewRecords";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";
import { isAppointmentHappeningNow, isAppointmentUpcoming, sortUpcomingWithHappeningNow } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { getIanaZone } from "@/utils/timezone";
import { useSession } from "next-auth/react";

export default function DashboardPage() {
  const { data: session } = useSession();
  const welcomeName = session?.user?.name?.trim();
  const [requests, setRequests] = React.useState<any[]>([]);
  const [interpreterJobs, setInterpreterJobs] = React.useState<any[]>([]);
  const [currentTime, setCurrentTime] = React.useState<number>(Date.now());
  const [awaitingReviewCount, setAwaitingReviewCount] = React.useState<number>(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Re-callable so client-side consumers (e.g. the ODHH ingest tester) can force a reload from PostgreSQL.
  const loadRequests = React.useCallback(async (): Promise<void> => {
    try {
      const [data, submitted] = await Promise.all([
        fetchLiveRequests(),
        getSubmittedTimesheets().catch((): SubmittedTimesheet[] => []),
      ]);
      setRequests(data);

      // Same records, same merge and same predicate as the /hours-review "Awaiting review" tab.
      let localRecords: ServiceRecord[] = [];
      try {
        localRecords = JSON.parse(localStorage.getItem('terpdesk_service_records') || '[]');
      } catch {
        localRecords = [];
      }
      const records = mergeHoursRecords({ localRecords, requests: data, timesheets: submitted });
      setAwaitingReviewCount(records.filter(isAwaitingReview).length);
    } catch (e) {
      console.error(e);
    }
  }, []);

  React.useEffect(() => {
    void loadRequests();

    const loadJobs = () => {
      try {
        const storedJobs = JSON.parse(localStorage.getItem('terpdesk_interpreter_jobs') || '[]');
        setInterpreterJobs(storedJobs);
      } catch (e) {
        console.error(e);
      }
    };
    loadJobs();
    window.addEventListener('storage', loadJobs);

    // Keep every metric on one live snapshot: refresh periodically and when the tab regains focus.
    const refresh = setInterval(() => void loadRequests(), 30000);
    const onFocus = () => void loadRequests();
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('storage', loadJobs);
      window.removeEventListener('focus', onFocus);
      clearInterval(refresh);
    };
  }, [loadRequests]);

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

  const formatEventTime = (startsAt?: string, endsAt?: string, timeZone?: string) => {
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

  const formatStatusBadge = (status: string) => {
    if (!status) return "Assigned";
    const s = status.trim().toLowerCase();
    if (s === "booked") return "Booked";
    if (s === "assigned") return "Assigned";
    if (s.includes("partially")) return "Partially staffed";
    if (s.includes("fully")) return "Fully staffed";
    return status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  };

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

  const totalAppointments = enrichedRequests.filter(r => !getStatusFilters(r as any).isCancelled).length;
  // Identical predicate to the /requests "Needing coverage" filter, so the number matches the list.
  const needingCoverage = enrichedRequests.filter(r => getStatusFilters(r as any).needingCoverage).length;
  const pendingOffersCount = enrichedRequests.filter(r => getStatusFilters(r as any).hasPendingOffer).length;
  const staffFollowUpCount = enrichedRequests.filter(r => getStatusFilters(r as any).staffFollowUp).length;
  const needsReplacementCount = enrichedRequests.filter(r => getStatusFilters(r as any).needsReplacement).length;

  const getNeedsAttentionPriority = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'needs replacement') return 1;
    if (s === 'staff follow-up') return 2;
    if (s.includes('awaiting') || s.includes('offer') || s.includes('pending')) return 3;
    if (s.includes('unfilled') || s.includes('draft') || s.includes('partially')) return 4;
    return 5;
  };

  const needsAttentionJobs = [...enrichedRequests]
    .filter(r => {
      const filters = getStatusFilters(r as any);
      if (filters.isCancelled) return false;
      if (r.endsAt && Date.now() > new Date(r.endsAt).getTime()) return false;
      
      if (filters.fullyStaffed && !filters.staffFollowUp && !filters.hasPendingOffer) return false;
      
      return filters.needsReplacement || filters.needingCoverage || filters.hasPendingOffer || filters.staffFollowUp || filters.partiallyStaffed;
    })
    .map(r => ({ ...r, displayStatus: getStaffingLabel(r as any) }))
    .sort((a, b) => getNeedsAttentionPriority(a.displayStatus) - getNeedsAttentionPriority(b.displayStatus));

  const upcomingBookingsJobs = sortUpcomingWithHappeningNow(
    [...enrichedRequests].filter(r => {
      const s = r.status.toLowerCase();
      if (s.includes('cancel')) return false;
      
      const reqJobs = interpreterJobs.filter(j => j.id === r.id || j.requestId === r.id);
      const acceptedCount = reqJobs.filter(j => j.status === 'booked' || j.status === 'accepted').length;
      
      // Booking remains categorized under upcoming until its endsAt time has completely passed
      if (!isAppointmentUpcoming(r, currentTime)) return false;
      
      // Active staffing
      const hasStaffing = acceptedCount > 0 || r.hasAcceptedOffer || s.includes('staffed') || s.includes('booked') || s.includes('assigned');
      return hasStaffing;
    }),
    currentTime
  ).slice(0, 6);

  const happeningNowJobs = enrichedRequests.filter(r => isAppointmentHappeningNow(r, currentTime));
  const upcomingHappeningNowCount = upcomingBookingsJobs.filter(j => isAppointmentHappeningNow(j, currentTime)).length;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto max-w-[1200px] space-y-10 pt-2">
  
      {/* Persistent Live Appointment Status Banner */}
      {happeningNowJobs.length > 0 ? (
        <div className="bg-gradient-to-r from-[#0F3830] via-[#1B433C] to-[#24544B] border border-emerald-500/50 text-white rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
            </span>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Live Appointment Status</span>
                <span className="bg-emerald-500/30 text-emerald-200 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-emerald-400/30">Happening now</span>
              </div>
              <p className="text-[15px] font-semibold text-white">
                {happeningNowJobs.length === 1 
                  ? happeningNowJobs[0].title 
                  : `${happeningNowJobs.length} active appointments in progress`}
              </p>
              {happeningNowJobs.length === 1 ? (
                <p className="text-[13px] text-emerald-200/80 mt-0.5">
                  {formatEventTime(
                    happeningNowJobs[0].startsAt,
                    happeningNowJobs[0].endsAt,
                    happeningNowJobs[0].details?.timeZone || happeningNowJobs[0].data?.details?.timeZone
                  )}
                  {happeningNowJobs[0].onsite?.venue || happeningNowJobs[0].location ? ` · ${happeningNowJobs[0].onsite?.venue || happeningNowJobs[0].location}` : ''}
                </p>
              ) : (
                <p className="text-[13px] text-emerald-200/80 mt-0.5">
                  {happeningNowJobs.length} booked assignments are active right now across your agency roster.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <Link
              href={happeningNowJobs.length === 1 ? `/requests/${happeningNowJobs[0].id}` : `/requests?filter=happening-now`}
              className="w-full sm:w-auto inline-flex items-center justify-center bg-white text-[#1B433C] font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-emerald-50 transition-colors shadow-sm"
            >
              {happeningNowJobs.length === 1 ? 'Open active booking →' : 'View live requests →'}
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-[#F8F7F4] border border-[#EBE8DF] text-[var(--ink)] rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-stone-400"></span>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--sage)]">Live Appointment Status</span>
              </div>
              <p className="text-[14px] text-gray-600 font-medium">
                No active bookings right now
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Banners & Inputs */}
      <div className="space-y-6">
        <div className="space-y-1.5 w-full">
          <label className="pl-5 text-[13px] font-medium text-[var(--sage)]">Agency</label>
          <div className="rounded-full bg-[#F3F2EE] px-6 py-3.5 text-[15px] text-slate-600 border border-neutral-200/50">
            North Fictional Interpreting
          </div>
        </div>
      </div>

      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 md:gap-0">
        <div className="space-y-2">
          <h1 className="text-[32px] font-semibold tracking-tight text-[var(--ink)]">{welcomeName ? `Welcome, ${welcomeName}` : "Welcome"}</h1>
          <p className="text-[15px] text-[var(--sage)]">
            Your scheduling desk. Appointments and coverage saved across authorized accounts.
          </p>
        </div>
        <Link href="/requests/new" className="inline-block rounded-full bg-[var(--forest)] px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#0B3B32]/50">
          New request
        </Link>
      </div>

      {/* Dark Stats Card */}
      <div className="rounded-2xl border border-gray-200 bg-[var(--forest)] p-8 text-white ">
        <p className="mb-8 text-xs font-medium text-[#8BA49E]">
          Upcoming appointments and unresolved past appointments
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-6">
          <Link href="/requests" className="flex flex-col gap-2 text-left hover:opacity-75 transition-opacity cursor-pointer">
            <span className="text-[11px] font-semibold tracking-widest text-[#8BA49E]">APPOINTMENTS</span>
            <span className="text-[28px] font-medium leading-none">{totalAppointments}</span>
          </Link>
          <Link href="/requests?filter=needing-coverage" className="flex flex-col gap-2 text-left hover:opacity-75 transition-opacity cursor-pointer">
            <span className="text-[11px] font-semibold tracking-widest text-[#8BA49E]">NEEDING COVERAGE</span>
            <span className="text-[28px] font-medium leading-none">{needingCoverage}</span>
          </Link>
          <Link href="/requests?filter=pending-offers" className="flex flex-col gap-2 text-left hover:opacity-75 transition-opacity cursor-pointer">
            <span className="text-[11px] font-semibold tracking-widest text-[#8BA49E]">PENDING OFFERS</span>
            <span className="text-[28px] font-medium leading-none">{pendingOffersCount}</span>
          </Link>
          <Link href="/requests?filter=staff-follow-up" className="flex flex-col gap-2 text-left hover:opacity-75 transition-opacity cursor-pointer">
            <span className="text-[11px] font-semibold tracking-widest text-[#8BA49E]">STAFF FOLLOW-UP</span>
            <span className="text-[28px] font-medium leading-none">{staffFollowUpCount}</span>
          </Link>
          
          <Link href="/requests?filter=needs-replacement" className="flex flex-col gap-2 text-left hover:opacity-75 transition-opacity cursor-pointer">
            <span className="text-[11px] font-semibold tracking-widest text-[#8BA49E]">NEEDS REPLACEMENT</span>
            <span className="text-[28px] font-medium leading-none">{needsReplacementCount}</span>
          </Link>
          <Link href="/hours-review" className="flex flex-col gap-2 text-left hover:opacity-75 transition-opacity cursor-pointer">
            <span className="text-[11px] font-semibold tracking-widest text-[#8BA49E]">HOURS AWAITING REVIEW</span>
            <span className="text-[28px] font-medium leading-none">{awaitingReviewCount}</span>
          </Link>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Column (col-span-2) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Needs attention */}
          <section className="space-y-5">
            <h2 className="text-lg font-semibold text-[var(--ink)] px-2">Needs attention</h2>
            
            <div className="space-y-2.5">
              {needsAttentionJobs.length === 0 && <p className="text-sm text-[var(--sage)]">Nothing needs your attention right now.</p>}
              <AnimatedPaginatedList
                items={needsAttentionJobs}
                itemsPerPage={5}
                className="space-y-2.5"
                getKey={(request) => request.id}
                renderItem={(request) => {
                const s = (request as any).displayStatus;
                let dotColor = "bg-[#B59A6D]";
                let btnLabel = "Manage slots";
                
                const statusLower = s.toLowerCase();
                
                if (s === 'Needs replacement' || s === 'Staff follow-up') {
                  dotColor = "bg-red-500";
                  btnLabel = "Open";
                } else if (statusLower.includes('awaiting') || statusLower.includes('offer') || statusLower.includes('pending')) {
                  dotColor = "bg-[#AF4A3F]";
                  btnLabel = "View";
                } else if (statusLower.includes('partially')) {
                  dotColor = "bg-[#385B52]";
                  btnLabel = "Manage slots";
                } else if (statusLower.includes('unfilled') || statusLower.includes('draft')) {
                  btnLabel = "Open";
                }
                
                if ((request as any).hasAcceptedOffer) {
                  btnLabel = "Manage slots";
                }

                return (
                  <Link href={`/requests/${request.id}`} key={request.id} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-[#EFECE5] px-6 py-3.5 hover:bg-[#e8e4db] transition-colors cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${dotColor}`}></div>
                      <div className="flex flex-col">
                        <p className="text-[15px] font-medium text-slate-800">{(request as any).displayStatus} — {request.title}</p>
                        <p className="mt-0.5 text-[13px] text-[var(--sage)]">{formatEventTime(request.startsAt, request.endsAt, request.details?.timeZone || request.data?.details?.timeZone)}</p>
                        {request.pendingOffer && <p className="text-xs text-[#AF4A3F] mt-1 font-medium">Offer expires soon</p>}
                      </div>
                    </div>
                    <div className="ml-4 shrink-0 text-sm font-medium text-slate-700 transition-colors">
                      {btnLabel}
                    </div>
                  </Link>
                );
              }}
              />
            </div>
          </section>

          {/* Upcoming bookings */}
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4 px-2">
              <div className="flex items-center gap-3">
                <h2 className="text-[17px] font-semibold text-[var(--ink)]">Upcoming bookings</h2>
                {upcomingHappeningNowCount > 0 && (
                  <span className="inline-flex h-6 items-center gap-1.5 px-2.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    {upcomingHappeningNowCount} active now
                  </span>
                )}
              </div>
              <Link href="/calendar" className="text-sm font-medium text-slate-600 hover:text-[var(--ink)] transition-colors whitespace-nowrap">Open calendar →</Link>
            </div>

            {upcomingBookingsJobs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-sm text-[var(--sage)]">
                No upcoming bookings right now.
              </div>
            ) : (
              <AnimatedPaginatedList
                items={upcomingBookingsJobs}
                itemsPerPage={6}
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
                getKey={(job) => job.id}
                renderItem={(job) => {
                  const isHappening = isAppointmentHappeningNow(job, currentTime);
                  const tz = job.details?.timeZone || job.data?.details?.timeZone;
                  const setting = job.setting || job.details?.setting || "Medical";
                  const format = job.format || job.details?.format || (job.isVirtual ? "Virtual" : "In person");
                  const venue = job.location || job.onsite?.venue || (format.toLowerCase().includes('virtual') ? "Virtual" : "Location pending");
                  const org = job.requester?.org;
                  const formattedBadge = formatStatusBadge(job.status);
                  
                  return (
                    <Link
                      key={job.id}
                      href={`/requests/${job.id}`}
                      className={`block bg-white rounded-2xl border p-4 hover:shadow-md transition-all cursor-pointer ${
                        isHappening
                          ? 'border-emerald-500/60 ring-2 ring-emerald-500/10 bg-emerald-50/20'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-1">
                        <div className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase leading-6">
                          {(() => {
                            try {
                              const s = parseSafeDate(job.startsAt);
                              if (!s) return "Date TBD";
                              const safeZone = getIanaZone(tz);
                              const e = parseSafeDate(job.endsAt);
                              const dateStr = formatInTimeZone(s, safeZone, "EEE, MMM d").toUpperCase();
                              const timeStart = formatInTimeZone(s, safeZone, "h:mm a");
                              const timeEnd = e
                                ? formatInTimeZone(e, safeZone, "h:mm a zzz")
                                : formatInTimeZone(s, safeZone, "h:mm a zzz");
                              return `${dateStr} · ${timeStart} – ${timeEnd}`;
                            } catch (e) {
                              return "Date TBD";
                            }
                          })()}
                        </div>
                        <div className="flex flex-row flex-wrap items-center justify-end gap-2">
                          {isHappening && (
                            <HappeningNowBadge size="sm" className="h-6" />
                          )}
                          <div className={`inline-flex h-6 items-center text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0 ${
                            formattedBadge.toLowerCase().includes('partially') 
                              ? 'bg-[#E8F3EE] text-[#466960]' 
                              : 'bg-[#E2EBE5] text-[#1B433C]'
                          }`}>
                            {formattedBadge}
                          </div>
                        </div>
                      </div>
                      
                      <h3 className="text-base font-semibold text-[var(--ink)] my-1.5 leading-snug">
                        {job.title}
                      </h3>

                      <div className="flex items-start gap-2 mb-2.5">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                        <div className="text-[13px] leading-snug">
                          <span className="text-[var(--ink)] block">{venue}</span>
                          {org && <span className="text-[var(--sage)]">{org}</span>}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        <span className="text-[11px] font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full">
                          {setting}
                        </span>
                        <span className="text-[11px] font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full">
                          {format}
                        </span>
                        {org && (
                          <span className="text-[11px] font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full">
                            {org}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                }}
              />
            )}
          </section>

        </div>

        {/* Right Column (col-span-1) */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 border border-neutral-100/50 h-full max-h-[400px]">
            <h2 className="mb-4 text-[17px] font-semibold text-[var(--ink)]">Unavailable in this test workspace</h2>
            <p className="text-[15px] leading-relaxed text-[var(--sage)]">
              Billing, payments and integrations are unavailable. Notifications appear inside the app, and you can turn on optional email notices in Settings. Nothing is texted or pushed to your device.
            </p>
          </div>
        </div>
      </div>

    </motion.div>
  );
}
