"use client";

import React from "react";
import Link from "next/link";
import { Calendar, X, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { VerificationBanners } from "@/components/features/VerificationBanners";
import { HoursOverdueBanner } from "@/components/interpreter/HoursOverdueBanner";
import { ScheduleBanners } from "@/components/interpreter/ScheduleBanners";
import { InsuranceWarningBanner } from "@/components/interpreter/InsuranceWarningBanner";
import { HomeOfferCard } from "@/components/interpreter/HomeOfferCard";
import { AcceptOfferDialog } from "@/components/interpreter/AcceptOfferDialog";
import { GettingStartedCard } from "@/components/interpreter/home/GettingStartedCard";
import { HappeningNowBanner } from "@/components/interpreter/home/HappeningNowBanner";
import { HomeStatsCard } from "@/components/interpreter/home/HomeStatsCard";
import { HoursToSubmitSection } from "@/components/interpreter/home/HoursToSubmitSection";
import { UpcomingBookingCard } from "@/components/interpreter/home/UpcomingBookingCard";
import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import { useInterpreterName } from "@/context/InterpreterNameContext";
import { useInterpreterHome } from "@/hooks/useInterpreterHome";
import { bucketInterpreterJobs, isLivePendingOffer } from "@/lib/interpreterJobBuckets";
import { getJobHoursState, isJobNeedingHours } from "@/utils/hoursState";
import { isAppointmentHappeningNow, isAppointmentUpcoming, sortUpcomingWithHappeningNow } from "@/utils/happeningNow";

export default function InterpreterHomePage() {
  const home = useInterpreterHome();
  const { jobs, offers, currentTime, serviceRecords, profileTimezone, connectedAgencyCount, acceptError, setAcceptError, acceptingOffer } = home;
  // Preferred name, else the account name (same name the sidebar shows).
  const { name: displayName } = useInterpreterName();

  // Upcoming only: live offers and bookings still ahead (lib/interpreterJobBuckets.ts), never past or closed jobs.
  const upcomingAppointments = bucketInterpreterJobs(jobs, currentTime).upcoming.length;
  const upcomingBookedJobs = jobs.filter((job) => job.status === "booked" && isAppointmentUpcoming(job, currentTime));
  const sortedUpcomingBookings = sortUpcomingWithHappeningNow(upcomingBookedJobs, currentTime);
  const happeningNowJobs = upcomingBookedJobs.filter((job) => isAppointmentHappeningNow(job, currentTime));

  // Offers that can still be answered: pending, before their response deadline, appointment not over. Nothing else is listed.
  const pendingOffersList = offers.filter((o) => isLivePendingOffer(o, currentTime));
  const pendingOffers = pendingOffersList.length;

  // State jobs are listed too: their card points to the ODHH Verification Form (hours are reported in the state's portal).
  const sortedHoursToSubmitJobs = jobs
    .filter((job) => isJobNeedingHours(job, serviceRecords, currentTime, { includeState: true }))
    .sort((a, b) => {
      const stateA = getJobHoursState(a, serviceRecords);
      const stateB = getJobHoursState(b, serviceRecords);
      if (stateA === "correction_requested" && stateB !== "correction_requested") return -1;
      if (stateB === "correction_requested" && stateA !== "correction_requested") return 1;
      return 0;
    });

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-[1200px] mx-auto p-4 md:p-8 w-full space-y-8 pb-24 antialiased">
      <HappeningNowBanner jobs={happeningNowJobs} profileTimezone={profileTimezone} />

      <VerificationBanners />

      {acceptingOffer && (
        <AcceptOfferDialog
          title={acceptingOffer.title}
          pending={home.isPending && home.actingOfferId === acceptingOffer.id}
          error={acceptError}
          onCancel={() => { home.setAcceptingOffer(null); setAcceptError(null); }}
          onConfirm={home.confirmAccept}
        />
      )}

      <ScheduleBanners />
      <InsuranceWarningBanner />
      <HoursOverdueBanner />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pt-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--ink)] mb-2">
            {displayName ? `Welcome, ${displayName}` : "Welcome"}
          </h1>
          <p className="text-[var(--sage)] text-lg">
            {connectedAgencyCount === 0 ? "Your interpreting work, in one place." : "Your interpreting work, across your agencies."}
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

      <GettingStartedCard connectedAgencyCount={connectedAgencyCount} />

      <HomeStatsCard
        upcomingAppointments={upcomingAppointments}
        upcomingBookings={sortedUpcomingBookings.length}
        pendingOffers={pendingOffers}
        connectedAgencies={connectedAgencyCount ?? 0}
        hoursToSubmit={sortedHoursToSubmitJobs.length}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-[var(--ink)]">Your offers</h2>
              {pendingOffers > 0 && (
                <span className="text-xs text-[var(--sage)]">
                  {pendingOffers} active {pendingOffers === 1 ? "offer" : "offers"}
                </span>
              )}
            </div>

            {acceptError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3.5 text-xs flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{acceptError}</span>
                </div>
                <button type="button" onClick={() => setAcceptError(null)} className="text-red-600 hover:text-red-800 p-1 rounded-full cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {pendingOffers === 0 ? (
              <p className="text-[14px] text-[var(--sage)]">
                {connectedAgencyCount === 0 ? "Offers from an agency appear here once you are connected." : "Nothing needs your attention right now."}
              </p>
            ) : (
              <div className="space-y-4">
                {pendingOffersList.map((job) => (
                  <HomeOfferCard
                    key={job.id}
                    job={job}
                    accepting={home.isPending && home.actingOfferId === job.id}
                    onAccept={() => home.handleAcceptOffer(job)}
                    onDecline={home.handleDeclineOffer}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4 px-2">
              <h2 className="text-lg font-medium text-[var(--ink)]">Upcoming bookings</h2>
              <Link href="/interpreter-calendar" className="text-[13px] font-medium text-gray-600 hover:text-[var(--ink)] hover:underline shrink-0 whitespace-nowrap">
                Open calendar &rarr;
              </Link>
            </div>

            {sortedUpcomingBookings.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 text-[14px] text-[var(--sage)]">No upcoming bookings right now.</div>
            ) : (
              <AnimatedPaginatedList
                items={sortedUpcomingBookings}
                itemsPerPage={5}
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
                getKey={(job) => job.id}
                renderItem={(job) => (
                  <UpcomingBookingCard key={job.id} job={job} isHappening={isAppointmentHappeningNow(job, currentTime)} profileTimezone={profileTimezone} />
                )}
              />
            )}
          </div>

          <HoursToSubmitSection jobs={sortedHoursToSubmitJobs} serviceRecords={serviceRecords} currentTime={currentTime} profileTimezone={profileTimezone} />
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 min-h-[250px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-[var(--ink)]">Recent activity</h2>
              <Link href="#" className="text-[13px] font-medium text-gray-600 hover:text-[var(--ink)] hover:underline">
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
