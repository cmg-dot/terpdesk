"use client";

import React from "react";
import Link from "next/link";
import { Calendar, MapPin } from "lucide-react";
import { useInterpreterJobs } from "@/context/InterpreterJobsContext";
import { useGlobalState } from "@/context/GlobalContext";
import { motion } from "framer-motion";
import { fetchInterpreterOffers } from "@/app/actions/getInterpreterOffers";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { isAppointmentHappeningNow, isAppointmentUpcoming, sortUpcomingWithHappeningNow } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";

export default function InterpreterHomePage() {
  const { jobs, acceptJobOffer } = useInterpreterJobs();
  const { currentUser } = useGlobalState();
  const [offers, setOffers] = React.useState<any[]>([]);
  const [currentTime, setCurrentTime] = React.useState<number>(Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (currentUser?.email) {
      fetchInterpreterOffers(currentUser.email).then(data => {
        setOffers(data);
      }).catch(console.error);
    }
  }, [currentUser?.email]);

  const [isPending, startTransition] = React.useTransition();
  const [actingOfferId, setActingOfferId] = React.useState<string | null>(null);

  const handleAcceptOffer = (offer: any) => {
    setActingOfferId(offer.id);
    startTransition(async () => {
      setOffers(prev => prev.filter(o => o.id !== offer.id));
      await acceptJobOffer(offer.id);
      setActingOfferId(null);
    });
  };

  const visibleAppointments = jobs.filter((job) => job.status !== "declined" && job.status !== "released").length;
  const upcomingBookedJobs = jobs.filter((job) => job.status === "booked" && isAppointmentUpcoming(job, currentTime));
  const sortedUpcomingBookings = sortUpcomingWithHappeningNow(upcomingBookedJobs, currentTime);
  const upcomingBookings = sortedUpcomingBookings.length;
  const happeningNowJobs = upcomingBookedJobs.filter(job => isAppointmentHappeningNow(job, currentTime));
  const pendingOffersList = offers.filter(o => o.status === 'pending');
  const pendingOffers = pendingOffersList.length;
  const hoursToSubmit = jobs.filter((job) => job.status === "booked" && job.endsAt && new Date(job.endsAt).getTime() <= currentTime && job.serviceRecordState === "not_started").length;

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
      const safeZone = getIanaZone(timeZone);
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
              : `${happeningNowJobs.length} active bookings in progress`}
          </p>
          {happeningNowJobs.length === 1 && (
            <p className="text-[13px] text-emerald-200/80 mt-0.5">
              {formatJobDate(
                happeningNowJobs[0].startsAt || ((happeningNowJobs[0] as any).details?.startDate ? `${(happeningNowJobs[0] as any).details.startDate}T${(happeningNowJobs[0] as any).details.startTime || '00:00'}` : undefined),
                happeningNowJobs[0].endsAt || ((happeningNowJobs[0] as any).details?.endDate ? `${(happeningNowJobs[0] as any).details.endDate}T${(happeningNowJobs[0] as any).details.endTime || '00:00'}` : undefined),
                (happeningNowJobs[0] as any).details?.timeZone || happeningNowJobs[0].timeZone
              )}
              {happeningNowJobs[0].location ? ` · ${happeningNowJobs[0].location}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2.5 w-full sm:w-auto">
        <Link
          href={`/jobs/${happeningNowJobs[0].id}`}
          className="w-full sm:w-auto inline-flex items-center justify-center bg-white text-[#1B433C] font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-emerald-50 transition-colors shadow-sm"
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

  {/* Header */}
 <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pt-4">
 <div>
 <h1 className="text-4xl font-semibold tracking-tight text-[var(--ink)] mb-2">
 Welcome, Dale
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
 <div className="bg-[#1B433C] rounded-2xl border border-gray-200 p-6 text-white mt-8">
 <h2 className="text-[12px] font-medium text-[#8BA49E] mb-6">
 Current connected work
 </h2>

 <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-6">
 <div className="flex flex-col">
 <span className="text-[10px] font-semibold tracking-wider text-[#8BA49E] mb-2 uppercase">
 Visible appointments
 </span>
 <span className="text-[28px] font-medium tracking-tight text-white leading-none">
 {visibleAppointments}
 </span>
 </div>

 <div className="flex flex-col border-l border-white/10 pl-4 md:border-l md:border-white/10 md:pl-4">
 <span className="text-[10px] font-semibold tracking-wider text-[#8BA49E] mb-2 uppercase">
 Upcoming bookings
 </span>
 <span className="text-[28px] font-medium tracking-tight text-white leading-none">
 {upcomingBookings}
 </span>
 </div>

 <div className="flex flex-col md:border-l border-white/10 md:pl-4 pt-4 md:pt-0">
 <span className="text-[10px] font-semibold tracking-wider text-[#8BA49E] mb-2 uppercase">
 Pending offers
 </span>
 <span className="text-[28px] font-medium tracking-tight text-white leading-none">
 {pendingOffers}
 </span>
 </div>

 <div className="flex flex-col border-l border-white/10 pl-4 md:border-l md:border-white/10 md:pl-4 pt-4 md:pt-0">
 <span className="text-[10px] font-semibold tracking-wider text-[#8BA49E] mb-2 uppercase">
 Connected agencies
 </span>
 <span className="text-[28px] font-medium tracking-tight text-white leading-none">
 1
 </span>
 </div>

 <div className="flex flex-col border-l border-white/10 pl-4 -ml-4 mt-2 md:mt-0 pt-4 md:pt-0">
 <span className="text-[10px] font-semibold tracking-wider text-[#8BA49E] mb-2 uppercase">
 Hours to submit
 </span>
 <span className="text-[28px] font-medium tracking-tight text-white leading-none">
 {hoursToSubmit}
 </span>
 </div>
 </div>
 </div>

 {/* Grid Layout below stats */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
 {/* Left Column (2/3) */}
 <div className="lg:col-span-2 space-y-6">
 
 {/* Your Offers */}
 <div className="bg-white rounded-2xl border border-gray-200 p-6 border border-gray-200">
 <h2 className="text-lg font-medium text-[var(--ink)] mb-6">Your offers</h2>

 {pendingOffers === 0 ? (
 <p className="text-[14px] text-[var(--sage)]">
 Nothing needs your attention right now.
 </p>
 ) : (
 <div className="space-y-4">
 {pendingOffersList.map((job) => (
  <div
    key={job.id}
    className="bg-[var(--canvas)] rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-gray-200/50"
  >
    <div className="flex items-start gap-3">
    <div className="w-2 h-2 rounded-full bg-[#9B1C1C] mt-2 shrink-0" />
    <div>
    <h3 className="text-[15px] font-medium text-[var(--ink)] mb-1">
    Offer received — {job.title}
    </h3>
    <p className="text-[13px] text-[var(--sage)]">
    Expires {(() => {
      try {
        const endStr = job.endsAt || ((job as any).details?.endDate ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}` : undefined);
        if (!endStr) return 'Date TBD';
        const d = parseSafeDate(endStr);
        if (!d) return 'Date TBD';
        const tz = (job as any).details?.timeZone || job.timeZone;
        return formatInTimeZone(d, getIanaZone(tz), "MMM d, yyyy");
      } catch (e) {
        return 'Date TBD';
      }
    })()} · Pending offers do not reserve time.
    </p>
    </div>
    </div>
    <div className="flex gap-2 shrink-0 md:w-auto w-full">
      <Link
        href={`/jobs/${job.id}`}
        className="text-[13px] font-medium text-gray-700 hover:text-[var(--ink)] bg-white border border-gray-200 rounded-full px-4 py-2 text-center transition-colors flex-1 md:flex-none"
      >
        Review
      </Link>
      <button
        onClick={() => handleAcceptOffer(job)}
        disabled={isPending && actingOfferId === job.id}
        className="text-[13px] font-medium text-white bg-[var(--forest)] hover:bg-[#145347] disabled:opacity-50 disabled:cursor-not-allowed rounded-full px-4 py-2 text-center transition-colors flex-1 md:flex-none cursor-pointer flex justify-center items-center gap-2"
      >
        {isPending && actingOfferId === job.id ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Accepting...
          </>
        ) : (
          'Accept'
        )}
      </button>
    </div>
  </div>
  ))}
 </div>
 )}
 </div>

 {/* Upcoming Bookings */}
 <div>
 <div className="flex items-center justify-between mb-4 px-2">
 <h2 className="text-lg font-medium text-[var(--ink)]">Upcoming bookings</h2>
 <Link
 href="/interpreter-calendar"
 className="text-[13px] font-medium text-gray-600 hover:text-[var(--ink)] hover:underline shrink-0"
 >
 Open calendar &rarr;
 </Link>
 </div>

 {sortedUpcomingBookings.length === 0 ? (
   <div className="bg-white rounded-2xl border border-gray-200 p-6 text-[14px] text-[var(--sage)]">
     No upcoming bookings right now.
   </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {sortedUpcomingBookings.map((job) => {
 const isHappening = isAppointmentHappeningNow(job, currentTime);
 const locationParts = job.location.split("·");
 const locPrimary = locationParts[0]?.trim();
 const locSecondary = locationParts[1]?.trim();

 return (
 <Link
 key={job.id}
 href={`/jobs/${job.id}`}
 className={`block bg-white rounded-2xl border p-6 hover:shadow-md transition-all ${isHappening ? 'border-emerald-500/60 ring-2 ring-emerald-500/10' : 'border-gray-200'}`}
 >
 <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-2">
 <div className="text-[11px] font-bold tracking-wider text-[#A0522D] uppercase mt-1">
 {(() => {
    const startStr = job.startsAt || ((job as any).details?.startDate ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}` : undefined);
    const endStr = job.endsAt || ((job as any).details?.endDate ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}` : undefined);
    const tz = (job as any).details?.timeZone || job.timeZone;
    return startStr ? formatJobDate(startStr, endStr, tz) : job.dateString;
 })()}
 </div>
 <div className="flex items-center gap-2 flex-wrap">
 {isHappening && (
   <HappeningNowBadge />
 )}
 <div className="bg-[#E2EBE5] text-[#1B433C] text-[12px] font-medium px-3 py-1 rounded-full w-max shrink-0">
 Booked
 </div>
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
 
 {job.hasAutoFill && (
 <p className="text-[13px] text-[var(--sage)] mb-4">
 Booked by {locSecondary?.split('(')[0]?.trim()} using your Auto Fill permission.
 </p>
 )}

 <div className="flex flex-wrap gap-2 mt-4">
 <span className="text-[12px] font-medium text-gray-600 border border-gray-200 px-3 py-1 rounded-full">
 Setting pending
 </span>
 {job.isVirtual && (
 <span className="text-[12px] font-medium text-gray-600 border border-gray-200 px-3 py-1 rounded-full">
 Virtual
 </span>
 )}
 </div>
 </Link>
 );
 })}
 </div>
 )}
 </div>

 {/* Unavailable card */}
 <div className="bg-white rounded-2xl border border-gray-200 p-6 border border-gray-200 md:w-2/3 mt-6">
 <h2 className="text-lg font-medium text-[var(--ink)] mb-4">
 Unavailable in this test workspace
 </h2>
 <p className="text-[14px] text-[var(--sage)] leading-relaxed">
 Billing, payments and integrations are unavailable. Notifications
 appear inside the app, and you can turn on optional email notices
 in Settings. Nothing is texted or pushed to your device.
 </p>
 </div>
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
