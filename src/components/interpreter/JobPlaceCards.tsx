"use client";

import { ExternalLink, Lock } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { hasPhysicalPlace } from "@/lib/jobPlace";

/**
 * Where an interpreter goes, on the app's job page: the virtual meeting card, the on-site card, or both. A virtual job that
 * also has a place (an address, a room, a parking code) shows both, because people may attend in person. While the job is
 * only an offer, the meeting link, passcode, street address, room and parking are not even in the data (see
 * interpreterJobData.ts), so the cards say they come after acceptance.
 */

export interface PlaceJob {
  status: string;
  isVirtual: boolean;
  location: string;
  platform?: string | null;
  meetingLink?: string | null;
  meetingId?: string | null;
  passcode?: string | null;
  virtualInstructions?: string | null;
  credentialsLocked?: boolean;
  onsite?: Record<string, string>;
}

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 py-2 border-b border-gray-50 text-xs">
    <span className="text-[var(--sage)]">{label}</span>
    <span className="font-medium text-[var(--ink)] text-right break-words">{value}</span>
  </div>
);

function VirtualCard({ job, isOffer }: { job: PlaceJob; isOffer: boolean }) {
  const { meetingLink, meetingId, passcode } = job;
  const hasCredentials = Boolean(meetingLink || meetingId || passcode);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4" data-place-card="virtual">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-[16px] font-semibold text-[var(--ink)]">Virtual meeting details</h2>
          <p className="text-xs text-[var(--sage)] mt-0.5">Platform: <span className="font-medium text-gray-700">{job.platform || "Virtual meeting"}</span></p>
        </div>
        {meetingLink && !isOffer && (
          <a
            href={meetingLink.startsWith("http") ? meetingLink : `https://${meetingLink}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1B433C] text-white text-xs font-semibold hover:bg-[#14332D] transition-colors shadow-sm self-start sm:self-auto"
          >
            Open meeting link <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {isOffer && job.credentialsLocked ? (
        <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
          <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-900">Virtual credentials locked</p>
            <p className="text-amber-800 leading-relaxed">The meeting link, passcode and room details are shared only after you accept this offer.</p>
          </div>
        </div>
      ) : !isOffer && hasCredentials ? (
        <div className="space-y-3">
          {meetingLink && (
            <div className="bg-[#F8FAF9] p-3.5 rounded-xl border border-[#E3EBE7] flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-[var(--sage)] uppercase tracking-wider mb-0.5">Meeting Link</span>
                <span className="text-xs font-mono text-[#0B3B32] truncate block break-all">{meetingLink}</span>
              </div>
              <CopyButton text={meetingLink} label="meeting link" />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {meetingId && (
              <div className="bg-[#F8FAF9] p-3 rounded-xl border border-[#E3EBE7] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold text-[var(--sage)] uppercase tracking-wider mb-0.5">Meeting ID</span>
                  <span className="text-xs font-mono font-medium text-[var(--ink)]">{meetingId}</span>
                </div>
                <CopyButton text={meetingId} label="meeting ID" />
              </div>
            )}
            {passcode && (
              <div className="bg-[#F8FAF9] p-3 rounded-xl border border-[#E3EBE7] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold text-[var(--sage)] uppercase tracking-wider mb-0.5">Passcode</span>
                  <span className="text-xs font-mono font-medium text-[var(--ink)]">{passcode}</span>
                </div>
                <CopyButton text={passcode} label="passcode" />
              </div>
            )}
          </div>
          {job.virtualInstructions && (
            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 text-xs text-gray-700">
              <span className="font-semibold block text-[11px] text-[var(--sage)] uppercase tracking-wider mb-1">Virtual Instructions</span>
              <p className="leading-relaxed whitespace-pre-line">{job.virtualInstructions}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/80 text-sm">
          <p className="text-[var(--ink)] font-medium mb-1">Virtual details pending</p>
          <p className="text-[var(--sage)] text-xs">Meeting join link and credentials will be posted by the agency prior to appointment start.</p>
        </div>
      )}

      <p className="text-[12px] text-[var(--sage)] pt-1">Treat meeting links and access codes as restricted assignment information.</p>
    </div>
  );
}

function OnsiteCard({ job, isOffer }: { job: PlaceJob; isOffer: boolean }) {
  const onsite = job.onsite ?? {};
  const venue = /^virtual/i.test(onsite.venue ?? "") ? "" : onsite.venue ?? "";
  const where = [venue, onsite.address].filter(Boolean).join(" · ") || job.location;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4" data-place-card="onsite">
      <h2 className="text-[16px] font-semibold text-[var(--ink)] mb-2">On-site location details</h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-100">
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold text-[var(--sage)] uppercase tracking-wider mb-0.5">{onsite.address ? "Venue / Address" : "Venue"}</span>
            <span className="text-xs font-medium text-[var(--ink)] break-words">{where}</span>
          </div>
          {where && onsite.address && <CopyButton text={where} label="address" />}
        </div>
        {onsite.building && <Detail label="Building" value={onsite.building} />}
        {onsite.floor && <Detail label="Floor" value={onsite.floor} />}
        {onsite.room && <Detail label="Room" value={onsite.room} />}
        {onsite.contact && <Detail label="Onsite Contact" value={`${onsite.contact}${onsite.contactMethod ? ` (${onsite.contactMethod})` : ""}`} />}
        {onsite.parking && (
          <div className="py-2 border-b border-gray-50 text-xs">
            <span className="text-[var(--sage)] block mb-1">Directions &amp; Parking</span>
            <span className="text-[var(--ink)] whitespace-pre-line">{onsite.parking}</span>
          </div>
        )}
        {onsite.entrance && (
          <div className="py-2 text-xs">
            <span className="text-[var(--sage)] block mb-1">Entrance &amp; Check-in</span>
            <span className="text-[var(--ink)]">{onsite.entrance}</span>
          </div>
        )}
        {isOffer && !job.isVirtual && (
          <p className="text-[12px] text-[var(--sage)]">The street address, room and parking details are shared after you accept this offer.</p>
        )}
      </div>
    </div>
  );
}

export function JobPlaceCards({ job }: { job: PlaceJob }) {
  const isOffer = job.status === "pending";
  // An in-person job always shows its place. A virtual job shows one too when it has an address, room or parking note.
  const showOnsite = !job.isVirtual || (!isOffer && hasPhysicalPlace(job.onsite));
  return (
    <>
      {job.isVirtual && <VirtualCard job={job} isOffer={isOffer} />}
      {showOnsite && <OnsiteCard job={job} isOffer={isOffer} />}
    </>
  );
}
