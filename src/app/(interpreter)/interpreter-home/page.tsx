"use client";

import { settingLabel } from "@/lib/settingLabel";
import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { VerificationBanners } from "@/components/features/VerificationBanners";
import { HoursOverdueBanner } from "@/components/interpreter/HoursOverdueBanner";
import { ScheduleBanners } from "@/components/interpreter/ScheduleBanners";
import { OfferNotes } from "@/components/interpreter/OfferNotes";
import { OfferTags } from "@/components/interpreter/OfferTags";
import { ClarificationButton } from "@/components/jobDetails/ClarificationButton";
import { InsuranceWarningBanner } from "@/components/interpreter/InsuranceWarningBanner";
import { getConnectedAgencyCount } from "@/app/actions/agencyConnections";
import { Calendar, MapPin, Clock, X, AlertCircle } from "lucide-react";
import { useInterpreterJobs } from "@/context/InterpreterJobsContext";
import { useGlobalState } from "@/context/GlobalContext";
import { useInterpreterName } from "@/context/InterpreterNameContext";
import { motion } from "framer-motion";
import { fetchInterpreterOffers } from "@/app/actions/getInterpreterOffers";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { isAppointmentHappeningNow, isAppointmentUpcoming, sortUpcomingWithHappeningNow } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { UpdatedBadge } from "@/components/jobDetails/UpdatedBadge";
import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import { isJobNeedingHours, getJobHoursState, getHoursBadgeInfo, findOwnServiceRecord, showsStatePortal } from "@/utils/hoursState";
import { HoursDueLine } from "@/components/interpreter/HoursDueLine";
import { ODHH_VERIFICATION_FORM_URL } from "@/lib/odhhPortal";
import { resolveRequestTimes } from "@/utils/timezone";
import { td_availability_view } from "@/app/actions/availability";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
import { bucketInterpreterJobs, isLivePendingOffer } from "@/lib/interpreterJobBuckets";
import { jobPlaceLines } from "@/lib/jobPlaceLines";
import { offerDeadlineLabel } from "@/lib/offerDeadline";
import { HomeOfferCard } from "@/components/interpreter/HomeOfferCard";
import type { HomeOffer } from "@/components/interpreter/HomeOfferCard";
import { AcceptOfferDialog } from "@/components/interpreter/AcceptOfferDialog";
import type { AcceptAnswersInput } from "@/lib/acceptAnswers";
import { jobWhenParts } from "@/lib/interpreterJobDate";

/** A job's `details.setting` / `details.format` when the server sent them as text, else "". */
const detailText = (job: object, key: "setting" | "format"): string => {
  const value = (job as { details?: Record<string, unknown> | null }).details?.[key];
  return typeof value === "string" ? value : "";
};

export default function InterpreterHomePage() {
  const { jobs, acceptJobOffer, declineOffer } = useInterpreterJobs();
  const { currentUser } = useGlobalState();
  const { data: session } = useSession();
  // Preferred name, else the account name (same name the sidebar shows).
  const { name: displayName } = useInterpreterName();
  const [connectedAgencyCount, setConnectedAgencyCount] = React.useState(0);
  React.useEffect(() => {
    getConnectedAgencyCount().then(setConnectedAgencyCount).catch(() => setConnectedAgencyCount(0));
  }, [session?.user?.id]);
  const [offers, setOffers] = React.useState<HomeOffer[]>([]);
  const [currentTime, setCurrentTime] = React.useState<number>(Date.now());
  const [serviceRecords, setServiceRecords] = React.useState<Record<string, unknown>[]>([]);
  const [acceptError, setAcceptError] = React.useState<string | null>(null);
  const [profileTimezone, setProfileTimezone] = React.useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedTz = localStorage.getItem('terpdesk_interpreter_timezone');
        if (storedTz) return storedTz;
        const storedUserTz = localStorage.getItem(`terpdesk_timezone_${currentUser?.id || 'terp-1'}`);
        if (storedUserTz) return storedUserTz;
        const storedAvail = localStorage.getItem('terpdesk_availability');
        if (storedAvail) {
          const parsed = JSON.parse(storedAvail);
          if (parsed?.baseTimezone) return parsed.baseTimezone;
        }
      } catch (e) {}
    }
    return 'America/Los_Angeles';
  });

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    const loadRecords = () => {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('terpdesk_service_records');
        if (stored) {
          try {
            setServiceRecords(JSON.parse(stored));
          } catch (e) {
            console.error("[interpreter-home page] operation failed");
          }
        }
      }
    };
    loadRecords();
    window.addEventListener('storage', loadRecords);
    return () => window.removeEventListener('storage', loadRecords);
  }, []);

  React.useEffect(() => {
    const loadTz = () => {
      if (typeof window !== 'undefined') {
        const storedTz = localStorage.getItem('terpdesk_interpreter_timezone');
        if (storedTz) setProfileTimezone(storedTz);
      }
    };
    loadTz();
    if (currentUser?.id) {
      td_availability_view(currentUser.id).then(data => {
        if (data.profile?.timeZone) {
          setProfileTimezone(data.profile.timeZone);
        }
      }).catch(() => console.error("[interpreter-home page] request failed"));
    }
    window.addEventListener('storage', loadTz);
    return () => window.removeEventListener('storage', loadTz);
  }, [currentUser?.id]);

  React.useEffect(() => {
    if (currentUser?.email) {
      fetchInterpreterOffers(currentUser.email).then(data => {
        setOffers(data);
      }).catch(() => console.error("[interpreter-home page] request failed"));
    }
  }, [currentUser?.email]);

  const [isPending, startTransition] = React.useTransition();
  const [actingOfferId, setActingOfferId] = React.useState<string | null>(null);

  // Accept first asks "Do you need travel time?" (AcceptOfferDialog); the offer is accepted with the answers.
  const [acceptingOffer, setAcceptingOffer] = React.useState<{ id: string; title: string } | null>(null);
  const handleAcceptOffer = (offer: HomeOffer) => {
    setAcceptError(null);
    setAcceptingOffer({ id: String(offer.id), title: String(offer.title || "this job") });
  };
  // Decline (after the card's own "Decline this offer?" confirmation): declineOffer tells the agency and closes the offer; the card
  // then leaves the list. A refusal (expired, withdrawn) rejects, the card shows it, and the list is reloaded to match the database.
  const handleDeclineOffer = async (offerId: string) => {
    try {
      await declineOffer(offerId);
    } catch (err) {
      if (currentUser?.email) fetchInterpreterOffers(currentUser.email).then(setOffers).catch(() => console.error("[interpreter-home page] request failed"));
      throw err;
    }
    setOffers((prev) => prev.filter((o) => o.id !== offerId));
  };
  const confirmAccept = (answers: AcceptAnswersInput) => {
    const offer = acceptingOffer;
    if (!offer) return;
    setAcceptError(null);
    setActingOfferId(offer.id);
    startTransition(async () => {
      try {
        await acceptJobOffer(offer.id, answers);
        setOffers(prev => prev.filter(o => o.id !== offer.id));
        setAcceptingOffer(null);
      } catch (err) {
        console.error("[interpreter-home page] operation failed");
        setAcceptError((err instanceof Error && err.message) || "This offer has expired and can no longer be accepted.");
        if (currentUser?.email) {
          fetchInterpreterOffers(currentUser.email).then(data => setOffers(data)).catch(() => console.error("[interpreter-home page] request failed"));
        }
      } finally {
        setActingOfferId(null);
      }
    });
  };

  // Upcoming only: live offers and bookings still ahead (lib/interpreterJobBuckets.ts), never past or closed jobs.
  const upcomingAppointments = bucketInterpreterJobs(jobs, currentTime).upcoming.length;
  const upcomingBookedJobs = jobs.filter((job) => job.status === "booked" && isAppointmentUpcoming(job, currentTime));
  const sortedUpcomingBookings = sortUpcomingWithHappeningNow(upcomingBookedJobs, currentTime);
  const upcomingBookings = sortedUpcomingBookings.length;
  const happeningNowJobs = upcomingBookedJobs.filter(job => isAppointmentHappeningNow(job, currentTime));

  // Offers that can still be answered: pending, before their response deadline, appointment not over. Nothing else is listed.
  const pendingOffersList = offers.filter(o => isLivePendingOffer(o, currentTime));
  const pendingOffers = pendingOffersList.length;

  // State jobs are listed too: their card points to the ODHH Verification Form (hours are reported in the state's portal).
  const hoursToSubmitJobs = jobs.filter((job) => isJobNeedingHours(job, serviceRecords, currentTime, { includeState: true }));
  const sortedHoursToSubmitJobs = [...hoursToSubmitJobs].sort((a, b) => {
    const stateA = getJobHoursState(a, serviceRecords);
    const stateB = getJobHoursState(b, serviceRecords);
    if (stateA === 'correction_requested' && stateB !== 'correction_requested') return -1;
    if (stateB === 'correction_requested' && stateA !== 'correction_requested') return 1;
    return 0;
  });
  const hoursToSubmit = sortedHoursToSubmitJobs.length;

  const parseSafeDate = (dateVal?: string) => {
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

  const getIanaZone = (tz?: string) => {
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

  const formatJobDate = (startStr?: string, endStr?: string, timeZone?: string) => {
    if (!startStr) return "Date TBD";
    try {
      const start = parseSafeDate(startStr);
      if (!start) return "Date TBD";
      const safeZone = getIanaZone(profileTimezone || timeZone);
      const end = parseSafeDate(endStr);
      const dateStr = formatInTimeZone(start, safeZone, "EEE, MMM d").toUpperCase();
      const timeStart = formatInTimeZone(start, safeZone, "h:mm a");
      const timeEnd = end ? formatInTimeZone(end, safeZone, "h:mm a zzz") : formatInTimeZone(start, safeZone, "h:mm a zzz");
      return `${dateStr} · ${timeStart} – ${timeEnd}`;
    } catch (e) {
      return "Date TBD";
    }
  };

 return (
 <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-[1200px] mx-auto p-4 md:p-8 w-full space-y-8 pb-24 antialiased">
  {/* Persistent Live Appointment Status Banner */}
  {happeningNowJobs.length > 0 ? (
    <div className="bg-gradient-to-r from-[#0F3830] via-[var(--forest-soft)] to-[#24544B] border border-emerald-500/50 text-white rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
              : `${happeningNowJobs.length} active bookings in progress`}
          </p>
          {happeningNowJobs.length === 1 && (
            <p className="text-[13px] text-emerald-200/80 mt-0.5">
              {(() => {
                const w = jobWhenParts(happeningNowJobs[0]);
                return formatJobDate(w.start, w.end, w.zone);
              })()}
              {happeningNowJobs[0].location ? ` · ${happeningNowJobs[0].location}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2.5 w-full sm:w-auto">
        <Link
          href={`/jobs/${happeningNowJobs[0].id}`}
          className="w-full sm:w-auto inline-flex items-center justify-center bg-white text-[var(--forest-soft)] font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-emerald-50 transition-colors shadow-sm"
        >
          Open active booking &rarr;
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

  <VerificationBanners />

  {acceptingOffer && (
    <AcceptOfferDialog
      title={acceptingOffer.title}
      pending={isPending && actingOfferId === acceptingOffer.id}
      error={acceptError}
      onCancel={() => { setAcceptingOffer(null); setAcceptError(null); }}
      onConfirm={confirmAccept}
    />
  )}

  <ScheduleBanners />

  <InsuranceWarningBanner />

  <HoursOverdueBanner />

  {/* Header */}
 <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pt-4">
 <div>
 <h1 className="text-4xl font-semibold tracking-tight text-[var(--ink)] mb-2">
 {displayName ? `Welcome, ${displayName}` : "Welcome"}
 </h1>
 <p className="text-[var(--sage)] text-lg">
 Your interpreting work, across your agencies.
 </p>
 </div>
 <Link
 href="/interpreter-calendar"
 className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-800 px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors w-full md:w-auto "
 >
 <Calendar className="w-4 h-4" />
 My calendar
 </Link>
 </div>

 {/* Stats Card */}
 <div className="bg-[var(--forest-soft)] rounded-2xl border border-gray-200 p-6 text-white mt-8">
 <h2 className="text-[12px] font-medium text-[var(--sidebar-muted)] mb-6">
 Current connected work
 </h2>

 <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-6">
 <div className="flex flex-col">
 <span className="text-[10px] font-semibold tracking-wider text-[var(--sidebar-muted)] mb-2 uppercase">
 Upcoming appointments
 </span>
 <span className="text-[28px] font-medium tracking-tight text-white leading-none">
 {upcomingAppointments}
 </span>
 </div>

 <div className="flex flex-col border-l border-white/10 pl-4 md:border-l md:border-white/10 md:pl-4">
 <span className="text-[10px] font-semibold tracking-wider text-[var(--sidebar-muted)] mb-2 uppercase">
 Upcoming bookings
 </span>
 <span className="text-[28px] font-medium tracking-tight text-white leading-none">
 {upcomingBookings}
 </span>
 </div>

 <div className="flex flex-col md:border-l border-white/10 md:pl-4 pt-4 md:pt-0">
 <span className="text-[10px] font-semibold tracking-wider text-[var(--sidebar-muted)] mb-2 uppercase">
 Pending offers
 </span>
 <span className="text-[28px] font-medium tracking-tight text-white leading-none">
 {pendingOffers}
 </span>
 </div>

 <div className="flex flex-col border-l border-white/10 pl-4 md:border-l md:border-white/10 md:pl-4 pt-4 md:pt-0">
 <span className="text-[10px] font-semibold tracking-wider text-[var(--sidebar-muted)] mb-2 uppercase">
 Connected agencies
 </span>
 <span className="text-[28px] font-medium tracking-tight text-white leading-none">
 {connectedAgencyCount}
 </span>
 </div>
 <Link
    href="/jobs?tab=past&filter=needs_hours"
    className="flex flex-col border-l border-white/10 pl-4 -ml-4 mt-2 md:mt-0 pt-4 md:pt-0 group hover:opacity-90 transition-opacity cursor-pointer"
    title="View past jobs needing hours"
  >
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-[10px] font-semibold tracking-wider text-[var(--sidebar-muted)] group-hover:text-white transition-colors uppercase">
        Hours to submit
      </span>
      {hoursToSubmit > 0 && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
        </span>
      )}
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-[28px] font-medium tracking-tight text-white leading-none">
        {hoursToSubmit}
      </span>
      {hoursToSubmit > 0 && (
        <span className="text-[11px] text-amber-300 font-medium group-hover:underline flex items-center">
          Action needed &rarr;
        </span>
      )}
    </div>
  </Link>
  </div>
  </div>

  {/* Grid Layout below stats */}
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
  {/* Left Column (2/3) */}
  <div className="lg:col-span-2 space-y-6">

  {/* Your Offers */}
  <div className="bg-white rounded-2xl border border-gray-200 p-6 border border-gray-200">
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-lg font-medium text-[var(--ink)]">Your offers</h2>
      {pendingOffers > 0 && (
        <span className="text-xs text-[var(--sage)]">
          {pendingOffers} active {pendingOffers === 1 ? 'offer' : 'offers'}
        </span>
      )}
    </div>

    {acceptError && (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3.5 text-xs flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{acceptError}</span>
        </div>
        <button
          type="button"
          onClick={() => setAcceptError(null)}
          className="text-red-600 hover:text-red-800 p-1 rounded-full cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )}

 {pendingOffers === 0 ? (
 <p className="text-[14px] text-[var(--sage)]">
 Nothing needs your attention right now.
 </p>
 ) : (
 <div className="space-y-4">
 {pendingOffersList.map((job) => (
  <HomeOfferCard
    key={job.id}
    job={job}
    accepting={isPending && actingOfferId === job.id}
    onAccept={() => handleAcceptOffer(job)}
    onDecline={handleDeclineOffer}
  />
 ))}
 </div>
 )}
 </div>

 {/* Upcoming Bookings */}
 <div>
 <div className="flex flex-wrap items-center justify-between gap-4 mb-4 px-2">
 <div className="flex items-center gap-3">
 <h2 className="text-lg font-medium text-[var(--ink)]">Upcoming bookings</h2>
 </div>
 <Link
 href="/interpreter-calendar"
 className="text-[13px] font-medium text-gray-600 hover:text-[var(--ink)] hover:underline shrink-0 whitespace-nowrap"
 >
 Open calendar &rarr;
 </Link>
 </div>

 {sortedUpcomingBookings.length === 0 ? (
   <div className="bg-white rounded-2xl border border-gray-200 p-6 text-[14px] text-[var(--sage)]">
     No upcoming bookings right now.
   </div>
 ) : (
 <AnimatedPaginatedList
 items={sortedUpcomingBookings}
 itemsPerPage={5}
 className="grid grid-cols-1 md:grid-cols-2 gap-3"
 getKey={(job) => job.id}
 renderItem={(job) => {
 const isHappening = isAppointmentHappeningNow(job, currentTime);
 const place = jobPlaceLines(job);
 const locPrimary = place.primary || (job.isVirtual ? "Virtual" : "Location pending");
 const locSecondary = place.secondary || (job.isVirtual ? "Remote / Video" : (job.agencyName || DEFAULT_AGENCY_NAME));

 return (
 <Link
 key={job.id}
 href={`/jobs/${job.id}`}
 className={`block bg-white rounded-2xl border p-4 hover:shadow-md transition-all ${isHappening ? 'border-emerald-500/60 ring-2 ring-emerald-500/10' : 'border-gray-200'}`}
 >
 <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-1">
 <div className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase leading-6">
 {(() => {
    const w = jobWhenParts(job);
    return w.start ? formatJobDate(w.start, w.end, w.zone) : job.dateString;
 })()}
 </div>
 <div className="flex flex-row flex-wrap items-center justify-end gap-2">
 {isHappening && (
   <HappeningNowBadge size="sm" className="h-6" />
 )}
 <div className="inline-flex h-6 items-center bg-[var(--surface)] text-[var(--forest-soft)] text-[11px] font-medium px-2.5 rounded-full whitespace-nowrap shrink-0">
 Booked
 </div>
 <UpdatedBadge update={job.detailsUpdated} endsAt={job.endsAt} />
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
 
 {job.hasAutoFill && (
 <p className="text-xs text-[var(--sage)] mb-2.5">
 Booked by {locSecondary?.split('(')[0]?.trim()} using your Auto Fill permission.
 </p>
 )}

 <div className="flex flex-wrap gap-1.5 mt-2.5">
 <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full">
 {settingLabel(job.setting, detailText(job, "setting"))}
 </span>
 <span className="text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-0.5 rounded-full">
 {job.isVirtual ? "Virtual" : (job.format || detailText(job, "format") || "In person")}
 </span>
 {job.positionIndex && (
 <span className="text-xs font-medium text-[var(--forest-soft)] bg-[var(--surface)] px-2.5 py-0.5 rounded-full">
 {(job.positionCount ?? 1) > 1 ? `Team · Position ${job.positionOrdinal ?? job.positionIndex} of ${job.positionCount}` : `Position ${job.positionOrdinal ?? job.positionIndex}`}
 </span>
 )}
 </div>
 </Link>
 );
 }}
 />
 )}
 </div>

 {/* Hours to submit Section (moved to bottom) */}
 {sortedHoursToSubmitJobs.length > 0 ? (
 <div id="hours-to-submit-section" className="bg-white rounded-2xl border border-amber-300/80 shadow-sm p-5 space-y-4 scroll-mt-6 mt-6">
 <div className="flex flex-wrap items-center justify-between gap-4 mb-4 border-b border-gray-100 pb-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 shrink-0 border border-amber-200">
 <Clock className="w-5 h-5" />
 </div>
 <div>
 <div className="flex items-center gap-2 flex-wrap">
 <h2 className="text-lg font-semibold text-[var(--ink)]">
 Hours to submit ({sortedHoursToSubmitJobs.length})
 </h2>
 {sortedHoursToSubmitJobs.some(j => getJobHoursState(j, serviceRecords) === 'correction_requested') && (
 <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
 Correction Needed
 </span>
 )}
 </div>
 <p className="text-[13px] text-[var(--sage)]">
 Past appointments and agency correction requests requiring your confirmed hours.
 </p>
 </div>
 </div>
 <Link
 href="/jobs?tab=past&filter=needs_hours"
 className="text-[13px] font-medium text-gray-600 hover:text-[var(--ink)] hover:underline shrink-0 whitespace-nowrap"
 >
 View in jobs &rarr;
 </Link>
 </div>

 <AnimatedPaginatedList
 items={sortedHoursToSubmitJobs}
 itemsPerPage={5}
 className="space-y-2.5"
 getKey={(job) => job.id}
 renderItem={(job) => {
 const hoursState = getJobHoursState(job, serviceRecords);
 const badgeInfo = getHoursBadgeInfo(hoursState);
 const isCorrection = hoursState === 'correction_requested';
 const place = jobPlaceLines(job);
 const locPrimary = place.primary || job.location;
 const locSecondary = place.secondary;

 const record = findOwnServiceRecord(serviceRecords, job);
 const reviewMsg = record?.reviewMessage || job.hoursSubmission?.reviewMessage;

 return (
 <div
 key={job.id}
 className={`rounded-xl p-3 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border ${
 isCorrection
 ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-400/20'
 : 'bg-[var(--canvas)] border-gray-200/80 hover:border-gray-300'
 }`}
 >
 <div className="space-y-1 flex-1 min-w-0">
 <div className="flex flex-row flex-wrap items-center gap-2">
 <span className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase">
 {(() => {
 const w = jobWhenParts(job);
 return w.start ? formatJobDate(w.start, w.end, w.zone) : job.dateString;
 })()}
 </span>
 <span className={`inline-flex h-6 items-center text-[11px] px-2.5 rounded-full whitespace-nowrap ${badgeInfo.badgeClass}`}>
 {badgeInfo.label}
 </span>
 </div>
 <h3 className="text-sm font-semibold text-[var(--ink)] truncate">
 {job.title}
 </h3>
 <div className="flex items-start gap-1.5 text-[13px] text-[var(--sage)]">
 <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
 <span>{locPrimary}{locSecondary ? ` · ${locSecondary}` : ''}</span>
 </div>
 {!isCorrection && <HoursDueLine endsAt={resolveRequestTimes(job).endsAt} stateForm={showsStatePortal(job, hoursState)} nowMs={currentTime} />}
 {isCorrection && reviewMsg && (
 <div className="mt-2 text-xs text-amber-900 bg-amber-100/90 rounded-lg p-2.5 border border-amber-200">
 <span className="font-semibold">Agency review comment: </span>"{reviewMsg}"
 </div>
 )}
 </div>

 <div className="shrink-0 w-full md:w-auto flex items-center justify-end">
 {showsStatePortal(job, hoursState) && !isCorrection ? (
 <a
 href={ODHH_VERIFICATION_FORM_URL}
 target="_blank"
 rel="noopener noreferrer"
 className="w-full md:w-auto text-xs font-semibold px-4 py-2 rounded-full transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm bg-[var(--forest-soft)] hover:bg-[var(--forest-deep)] text-white"
 >
 ODHH Verification Form →
 <span className="sr-only">(opens in a new tab)</span>
 </a>
 ) : (
 <Link
 href={`/jobs/${job.id}`}
 className={`w-full md:w-auto text-xs font-semibold px-4 py-2 rounded-full transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm ${
 isCorrection
 ? 'bg-amber-600 hover:bg-amber-700 text-white'
 : 'bg-[var(--forest-soft)] hover:bg-[var(--forest-deep)] text-white'
 }`}
 >
 {isCorrection
 ? 'Fix & Resubmit Hours →'
 : hoursState === 'draft'
 ? 'Resume Draft →'
 : 'Submit Hours →'}
 </Link>
 )}
 </div>
 </div>
 );
 }}
 />
 </div>
 ) : (
 <div id="hours-to-submit-section" className="bg-white rounded-2xl border border-gray-200 p-6 mt-6">
 <div className="flex flex-wrap items-center justify-between gap-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0 border border-emerald-200">
 <Clock className="w-5 h-5" />
 </div>
 <div>
 <h2 className="text-lg font-semibold text-[var(--ink)]">Hours to submit</h2>
 <p className="text-[13px] text-[var(--sage)]">
 No past appointments need hours submitted right now.
 </p>
 </div>
 </div>
 <Link
 href="/jobs?tab=past&filter=needs_hours"
 className="text-[13px] font-medium text-gray-600 hover:text-[var(--ink)] hover:underline shrink-0 whitespace-nowrap"
 >
 View in jobs &rarr;
 </Link>
 </div>
 </div>
 )}
 </div>

 {/* Right Column (1/3) */}
 <div className="lg:col-span-1">
 {/* Recent Activity */}
 <div className="bg-white rounded-2xl border border-gray-200 p-6 border border-gray-200 min-h-[250px]">
 <div className="flex items-center justify-between mb-6">
 <h2 className="text-lg font-medium text-[var(--ink)]">Recent activity</h2>
 <Link
 href="#"
 className="text-[13px] font-medium text-gray-600 hover:text-[var(--ink)] hover:underline"
 >
 All notifications &rarr;
 </Link>
 </div>
 <p className="text-[14px] text-[var(--sage)] leading-relaxed">
 Auto Fill bookings and newly shared prep materials will appear here.
 </p>
 </div>
 </div>
 </div>
 </motion.div>
 );
}
