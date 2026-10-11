"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRequests } from "@/context/RequestsContext";
import { useGlobalState } from "@/context/GlobalContext";
import { ChevronDown, Copy, Check } from "lucide-react";
import { fetchLiveRequestById } from "@/app/actions/getRequests";
import { getInterpreters } from "@/app/actions/getInterpreters";
import { createOffer } from "@/app/actions/createOffer";
import { updateOfferStatus } from "@/app/actions/updateOfferStatus";
import { cancelRequest } from "@/app/actions/cancelRequest";
import { wallClockToUtc, getIanaZone } from "@/utils/timezone";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { formatReference } from "@/utils/statusEngine";

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label ? `Copy ${label}` : "Copy to clipboard"}
      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      {copied && <span className="text-[11px] text-green-600 font-medium">Copied</span>}
    </button>
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

const mapSafeZone = (tz?: string) => getIanaZone(tz);

const formatDetailsDate = (startStr?: string | Date | null, endStr?: string | Date | null, timeZone?: string) => {
  try {
    if (!startStr) return "Date TBD";
    const start = parseSafeDate(startStr);
    if (!start) return "Date TBD";
    const safeZone = getIanaZone(timeZone);
    
    const dateStart = formatInTimeZone(start, safeZone, "EEE, MMM d");
    const timeStart = formatInTimeZone(start, safeZone, "h:mm a");
    
    let timeEnd = "";
    if (endStr) {
      const end = parseSafeDate(endStr);
      if (end) {
        timeEnd = formatInTimeZone(end, safeZone, "h:mm a zzz");
      }
    }
    if (!timeEnd) {
      timeEnd = formatInTimeZone(start, safeZone, "h:mm a zzz");
    }
    
    return `${dateStart} · ${timeStart} – ${timeEnd}`;
  } catch (e) {
    return "Date TBD";
  }
};

function getMockInterpreterDetails(id: string) {
  if (id === 'terp-1') return { name: "Active Interpreter" };
  if (id === 'terp-new') return { name: "New Interpreter" };
  return { name: `Interpreter ${id}` };
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
 return (
 <div className="flex justify-between items-center border-b border-gray-50 py-3 last:border-b-0">
 <span className="text-[var(--sage)] text-sm">{label}</span>
 <span className="text-[var(--ink)] text-sm font-medium">{value}</span>
 </div>
 );
}

// Convert camelCase object keys to Title Case labels
function formatLabel(key: string) {
 const result = key.replace(/([A-Z])/g, " $1");
 return result.charAt(0).toUpperCase() + result.slice(1);
}

export default function AssignmentDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { updateRequest } = useRequests();
  const { currentUser, memberships } = useGlobalState();
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const [dbInterpreters, setDbInterpreters] = useState<any[]>([]);

  useEffect(() => {
    getInterpreters().then(setDbInterpreters).catch(console.error);
  }, []);

  const activeRoster = dbInterpreters.map(m => ({
    id: m.id,
    name: m.name,
    isAutoFillEligible: true
  }));

  const [recipient, setRecipient] = useState('');
 const [autoBookRecipient, setAutoBookRecipient] = useState('');
 const [expiryDate, setExpiryDate] = useState('');
 const [expiryTime, setExpiryTime] = useState('');
 const [pendingOffer, setPendingOffer] = useState<{ interpreterName: string; date: string; time: string } | null>(null);
 const [errorMessage, setErrorMessage] = useState('');
 const [isEligible, setIsEligible] = useState<boolean | null>(null);
 const [bookedInterpreter, setBookedInterpreter] = useState<string | null>(null);
 const [previousOffers, setPreviousOffers] = useState<{ name: string; status: string; date: string }[]>([]);
 const [foundRequest, setFoundRequest] = useState<any>(null);
 const [isLoading, setIsLoading] = useState(true);

 const isCancelled = foundRequest?.status === 'Cancelled';
 const [showCancelModal, setShowCancelModal] = useState(false);
 const [cancelReasonInput, setCancelReasonInput] = useState('');
 const [clientRequested, setClientRequested] = useState(false);
 const cancelReason = foundRequest?.cancelReason || cancelReasonInput;
 const cancelDate = foundRequest?.canceledAt || '';



 

  useEffect(() => {
    if (id) {
      fetchLiveRequestById(id).then(data => {
        setFoundRequest(data);
        setIsLoading(false);
      }).catch(err => {
        console.error(err);
        setIsLoading(false);
      });
    }
  }, [id]);

 useEffect(() => {
   if (foundRequest) {
      if (foundRequest.slots) {
         const needsReplacement = foundRequest.slots.some((s: any) => !s.reservedBy && s.needsReplacement);
         if (needsReplacement) {
            setBookedInterpreter(null);
         }
      }
      if (foundRequest.offers && Array.isArray(foundRequest.offers)) {
         const activeOffer = foundRequest.offers.find((o: any) => o.state === 'pending' && new Date(o.expiresAt) > new Date());
         if (activeOffer) {
            const expDate = new Date(activeOffer.expiresAt);
            setPendingOffer({
               interpreterName: activeOffer.interpreterName,
               date: expDate.toISOString().split('T')[0],
               time: expDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
         }
      }
   }
 }, [foundRequest]);

 const getPayloadLocation = () => {
 if (foundRequest?.location && foundRequest.location.includes('·')) {
 return foundRequest.location;
 }
 return `${foundRequest?.location || 'Virtual'} · No location provided`;
 };

 const handleCancelAppointment = () => {
 setShowCancelModal(true);
 };

 const confirmCancelAppointment = async () => {
   try {
     await cancelRequest(id, cancelReasonInput);
     const updatedRequest = await fetchLiveRequestById(id);
     setFoundRequest(updatedRequest);
     setShowCancelModal(false);
   } catch (err) {
     console.error(err);
   }
 };

 const handleAutoBook = () => {
 const selectedName = activeRoster.find(i => i.id === autoBookRecipient)?.name || 'Unknown Interpreter';
 setBookedInterpreter(selectedName);

 localStorage.setItem(`agency_staffing_state_${id}`, JSON.stringify({ bookedInterpreter: selectedName, previousOffers }));

 if (selectedName.includes('Dale')) {
 const storedJobs = JSON.parse(localStorage.getItem('terpdesk_interpreter_jobs') || '[]');
 const jobIndex = storedJobs.findIndex((job: any) => String(job.id) === String(id));
 
 const payload = {
 ...(foundRequest || {}),
 id,
 status: 'booked',
 location: getPayloadLocation(),
 serviceRecordState: 'not_started'
 };

 if (jobIndex > -1) {
 storedJobs[jobIndex] = { ...storedJobs[jobIndex], ...payload };
 } else {
 storedJobs.push(payload);
 }
 
 localStorage.setItem('terpdesk_interpreter_jobs', JSON.stringify(storedJobs));
 }
 
 updateRequest(id, { status: 'Partially staffed' });
 };

 const handleCreateOffer = async () => {
    if (!recipient || !expiryDate || !expiryTime) {
      setErrorMessage('Please select an interpreter and set a valid future expiry date/time before the appointment starts.');
      return;
    }
    
    const jobTimeZone = mapSafeZone(foundRequest?.details?.timeZone);
    const inputValue = `${expiryDate}T${expiryTime}`;
    const expiryUtc = new Date(fromZonedTime(inputValue, jobTimeZone).toISOString());
    const startUtc = parseSafeDate(foundRequest?.startsAt) || new Date();

    if (expiryUtc <= new Date() || expiryUtc >= startUtc) {
      setErrorMessage('Expiry must be in the future and before appointment start.');
      return;
    }

    try {
      await createOffer({
        requestId: id,
        interpreterId: recipient,
        expiresAt: expiryUtc
      });

      // Refetch the request to get updated offers list
      const updatedRequest = await fetchLiveRequestById(id);
      setFoundRequest(updatedRequest);
      
      setErrorMessage('');
      setRecipient('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Failed to create offer. Please try again.');
    }
  };

 if (isLoading) {
  return (
    <div className="max-w-[1200px] mx-auto p-6 flex flex-col items-center justify-center h-[50vh]">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Loading request...</h1>
    </div>
  );
 }

 if (!foundRequest) {
 return (
 <div className="max-w-[1200px] mx-auto p-6 flex flex-col items-center justify-center h-[50vh]">
 <h1 className="text-2xl font-bold text-gray-800 mb-4">Assignment not found.</h1>
 <Link href="/dashboard" className="bg-[var(--forest)] text-[var(--canvas)] px-6 py-2.5 rounded-full font-medium transition-opacity hover:opacity-90">
 Return to dashboard
 </Link>
 </div>
 );
 }

 const assignment = {
 ...foundRequest,
 overview: foundRequest.overview || { location: "Fictional Clinic", reference: formatReference(foundRequest.id), status: isCancelled ? "Cancelled" : foundRequest.status },
 details: foundRequest.details || { setting: foundRequest.setting, purpose: "Routine checkup", format: "In person", timeZone: "Pacific Time — Seattle, Los Angeles", deafParticipant: "1", peopleNeeding: "1", commPreferences: "ASL", qualifications: "Medical certified" },
 onsite: foundRequest.onsite || { venue: "Fictional Clinic", address: "71, 13th ave Cubao, Quezon City", building: "Room 302", parking: "Visitor parking in front", entrance: "Main lobby", contact: "Ralph Chrysler Silva", contactMethod: "Text message" },
 requester: foundRequest.requester || { name: "Ralph Chrysler Silva", org: "Freshflow", email: "ralphchryslersilva65@gmail.com", phone: "09218648143", prefContact: "Text message", reqInterpreter: "No preference", teamSuggested: "Team suggested", billOrg: "Fictional clinic", billContact: "Billing Dept", billEmail: "ralphchryslersilva65@gmail.com", poNumber: "PO-9921" },
 prepNotes: foundRequest.prepNotes || "Please arrive 15 minutes early.",
 privateNotes: foundRequest.privateNotes || "Client requested experienced medical terp.",
 activity: foundRequest.activity || "created · Avery North · Mon, Sep 28 · 3:37 AM GMT+8"
 };

 const cardClass = "bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 border border-gray-200/50 shadow-none space-y-4";
 const inputClass = "w-full bg-[#F4F3EF] border-none rounded-full px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow";

 const realOffers = foundRequest.offers || [];
 const dbAcceptedOffer = realOffers.find((o: any) => o.state === 'accepted');
 const dbActiveOffer = realOffers.find((o: any) => o.state === 'pending' && new Date(o.expiresAt) > new Date());
 const dbPastOffers = realOffers.filter((o: any) => o.id !== dbActiveOffer?.id && o.id !== dbAcceptedOffer?.id);

 return (
 <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 space-y-6 pb-24 antialiased">
 {/* Test Banner */}
 {/* Back Link */}
 <Link href="/requests" className="inline-flex items-center gap-2 text-[var(--sage)] hover:text-[var(--ink)] mb-4 transition-colors">
 ← Back to assignments
 </Link>

 {/* Header Flex Row */}
 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
 <div>
 <h1 className="text-[28px] font-medium tracking-tight text-[var(--ink)]">{assignment.title}</h1>
 <p className="text-[var(--sage)] mt-1">{formatDetailsDate(assignment.startsAt, assignment.endsAt, assignment.details?.timeZone || assignment.timeZone)}</p>
 </div>
 <div className="flex flex-wrap items-center gap-3">
 {isAppointmentHappeningNow(assignment, currentTime) && (
   <HappeningNowBadge />
 )}
 {isCancelled && (
 <span className="bg-[#FEF2F2] text-[#991B1B] text-[13px] font-medium px-3 py-1 rounded-full border border-[#FCA5A5]/30">Cancelled</span>
 )}
 <button className="rounded-full px-5 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 transition-colors">
 View in calendar
 </button>
 {!isCancelled && (
 <Link href={`/requests/${params.id}/edit`} className="rounded-full px-5 py-2 text-sm font-medium text-white bg-[var(--forest)] hover:bg-[var(--forest)]/90 transition-colors">
 Edit assignment
 </Link>
 )}
 {!isCancelled && (
 <button 
 onClick={handleCancelAppointment}
 className="rounded-full px-5 py-2 text-sm font-medium text-white bg-[#C0564B] hover:bg-[#C0564B]/90 transition-colors"
 >
 Cancel appointment
 </button>
 )}
 </div>
 </div>

 {isCancelled && (
 <div className="space-y-4 mb-6">
 <div className="bg-[#FEF2F2] border border-[#FCA5A5]/30 text-[#991B1B] px-6 py-4 rounded-2xl border border-gray-200 text-[14px] leading-relaxed">
 This appointment was cancelled {cancelDate ? (() => {
   try {
     const d = parseSafeDate(cancelDate);
     if (!d) return '';
     return formatInTimeZone(d, mapSafeZone(assignment.details?.timeZone), "MMM d, yyyy h:mm a zzz");
   } catch (e) {
     return '';
   }
 })() : ''}. Every position was released and any pending offer was closed. {clientRequested && "The client requested cancellation. "}The record is kept; the scheduled times are unchanged.
 </div>
 <div className="bg-[#F5F4F0] text-gray-600 px-6 py-4 rounded-2xl border border-gray-200 text-sm">
 Internal reason (agency only): {cancelReason || "No reason provided"}
 </div>
 </div>
 )}

 <div className="flex flex-col gap-6 w-full">
 {/* Main Details */}
 
 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Overview</h2>
 <div className="flex flex-col">
 {Object.entries(assignment.overview).map(([key, val]) => (
 <DataRow key={key} label={formatLabel(key)} value={String(val)} />
 ))}
 </div>
 </div>

 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Assignment details</h2>
 <div className="flex flex-col">
 {Object.entries(assignment.details).map(([key, val]) => (
 <DataRow key={key} label={formatLabel(key)} value={String(val)} />
 ))}
 </div>
 </div>

 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">On-site details</h2>
 <div className="flex flex-col">
 {Object.entries(assignment.onsite).map(([key, val]) => (
 <DataRow key={key} label={formatLabel(key)} value={String(val)} />
 ))}
 </div>
 </div>

 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Preparation notes</h2>
 <p className="text-gray-800 text-[15px] leading-relaxed">
 {assignment.prepNotes}
 </p>
 </div>

 {Boolean((foundRequest?.data?.intake?.program === 'WA ODHH' || foundRequest?.data?.intake?.program === 'wa_odhh' || foundRequest?.program === 'WA ODHH' || foundRequest?.program === 'wa_odhh') && foundRequest?.data?.intake?.odhhSrn) && (
 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-4">WA ODHH</h2>
 <div className="flex flex-col">
 <div className="flex justify-between items-center py-3 border-b border-gray-100">
 <span className="text-sm text-gray-500">Service Request Number (SRN)</span>
 <div className="flex items-center gap-2">
   <span className="text-sm text-gray-800 font-medium">{foundRequest.data.intake.odhhSrn}</span>
   <CopyButton text={foundRequest.data.intake.odhhSrn} label="SRN" />
 </div>
 </div>
 <div className="flex justify-between items-center py-3 border-b border-gray-100">
 <span className="text-sm text-gray-500">Access code</span>
 <div className="flex items-center gap-2">
   <span className="text-sm text-gray-800 font-medium">{foundRequest.data.intake.odhhAccessCode || 'Not provided'}</span>
   {foundRequest.data.intake.odhhAccessCode && (
     <CopyButton text={foundRequest.data.intake.odhhAccessCode} label="Access code" />
   )}
 </div>
 </div>
 </div>
 <a 
 href={`https://fortress.wa.gov/dshs/odhhapps/interpreters/servicerequest.aspx?id=${foundRequest.data.intake.odhhSrn}`}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-block mt-4 rounded-full px-5 py-2.5 text-sm font-medium text-white bg-[#0B3B32] hover:bg-[#0f4037] transition-colors"
 >
 Acknowledge on ODHH
 </a>
 <p className="text-xs text-gray-400 mt-3">
 Staff only. Opens the state portal in a new tab; terpDESK does not submit anything to ODHH.
 </p>
 </div>
 )}

 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Requester and internal information</h2>
 <div className="flex flex-col">
 {Object.entries(assignment.requester).map(([key, val]) => (
 <DataRow key={key} label={formatLabel(key)} value={String(val)} />
 ))}
 </div>
 <p className="text-xs text-gray-400 mt-4">
 Staff only. A requested interpreter is a preference, not a booking.
 </p>
 </div>

 {/* Interactive / Staffing */}
 
 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Prep materials</h2>
 <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 flex flex-col gap-4">
 <div className="flex justify-between items-center">
 <span className="text-sm text-gray-600">Who can see this file?</span>
 <span className="text-sm font-medium text-[var(--ink)]">Agency only</span>
 </div>
 <button className="w-full bg-white border border-gray-200 rounded-full px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
 Add a file
 </button>
 </div>
 </div>

 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Service verification</h2>
 <label className="flex items-start gap-3 cursor-pointer mt-2">
 <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]" />
 <span className="text-sm text-gray-800 leading-snug">Ask each interpreter for a service-verification signature</span>
 </label>
 </div>

 {(() => {
   const isOdhh = foundRequest?.data?.intake?.program === 'WA ODHH' || foundRequest?.data?.intake?.program === 'wa_odhh' || foundRequest?.program === 'WA ODHH' || foundRequest?.program === 'wa_odhh';
   const hoursSub = foundRequest?.data?.hoursSubmission;
   const hasReportedHours = Boolean(hoursSub || ['awaiting_review', 'correction_requested', 'approved'].includes(foundRequest?.status));
   if (!hasReportedHours) return null;

   const actualStart = hoursSub?.actualStartTime || foundRequest?.startsAt;
   const actualEnd = hoursSub?.actualEndTime || foundRequest?.endsAt;
   const tz = mapSafeZone(assignment.details?.timeZone);

   const formatRange = (startIso?: string | null, endIso?: string | null) => {
     try {
       if (!startIso) return 'Not reported';
       const s = parseSafeDate(startIso);
       if (!s) return 'Not reported';
       const e = endIso ? parseSafeDate(endIso) : null;
       const dStr = formatInTimeZone(s, tz, 'EEE, MMM d');
       const stStr = formatInTimeZone(s, tz, 'h:mm a');
       const etStr = e ? formatInTimeZone(e, tz, 'h:mm a zzz') : 'TBD';
       return `${dStr} · ${stStr} - ${etStr}`;
     } catch (e) {
       return 'Not reported';
     }
   };

   const statusBadge = foundRequest.status === 'approved' 
     ? { label: 'Approved', bg: 'bg-green-100 text-green-700' }
     : foundRequest.status === 'correction_requested'
       ? { label: 'Correction requested', bg: 'bg-orange-100 text-orange-700' }
       : { label: 'Awaiting review', bg: 'bg-purple-100 text-purple-700' };

   let serviceTimeStr = "-";
   if (actualStart && actualEnd) {
     const s = parseSafeDate(actualStart);
     const e = parseSafeDate(actualEnd);
     if (s && e) {
       const mins = Math.max(0, ((e.getTime() - s.getTime()) / 60000) - (hoursSub?.breakMinutes || 0));
       serviceTimeStr = `${(mins / 60).toFixed(1)} hr`;
     }
   }

   const travelStr = isOdhh && (foundRequest.travelStartTime || hoursSub?.travelStartTime)
     ? formatRange(foundRequest.travelStartTime || hoursSub?.travelStartTime, foundRequest.travelEndTime || hoursSub?.travelEndTime)
     : 'None reported';

   const actualStr = formatRange(actualStart, actualEnd);

   return (
     <div className={cardClass}>
       <div className="flex justify-between items-center mb-4">
         <h2 className="text-[18px] font-medium text-[var(--ink)]">Reported service hours</h2>
         <span className={`px-3 py-1 text-[12px] font-medium rounded-full ${statusBadge.bg}`}>
           {statusBadge.label}
         </span>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm mb-6">
         <div className="space-y-4">
           <div>
             <div className="text-[var(--sage)] mb-1">Scheduled booking</div>
             <div className="text-[var(--ink)] font-medium">
               {formatRange(foundRequest.startsAt, foundRequest.endsAt)}
             </div>
           </div>

           {isOdhh ? (
             <>
               <div>
                 <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                   <span>Travel time</span>
                   {travelStr !== 'None reported' && (
                     <CopyButton text={travelStr} label="travel time" />
                   )}
                 </div>
                 <div className="text-[var(--ink)] font-medium">{travelStr}</div>
               </div>
               <div>
                 <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                   <span>Service completion</span>
                   <CopyButton
                     text={foundRequest.serviceCompleted === false || hoursSub?.serviceCompleted === 'no' || hoursSub?.serviceCompleted === false ? 'No' : 'Yes'}
                     label="service completion"
                   />
                 </div>
                 <div className="text-[var(--ink)] font-medium">
                   {foundRequest.serviceCompleted === false || hoursSub?.serviceCompleted === 'no' || hoursSub?.serviceCompleted === false ? 'Not completed (No)' : 'Completed (Yes)'}
                 </div>
               </div>
             </>
           ) : (
             <div>
               <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                 <span>Unpaid break</span>
                 <CopyButton text={hoursSub?.breakMinutes ? `${hoursSub.breakMinutes} min` : 'None'} label="unpaid break" />
               </div>
               <div className="text-[var(--ink)] font-medium">
                 {hoursSub?.breakMinutes ? `${hoursSub.breakMinutes} min` : 'None'}
               </div>
             </div>
           )}

           <div>
             <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
               <span>Mileage reported</span>
               <CopyButton text={`${(hoursSub?.miles ?? 0).toFixed(1)} mi`} label="mileage reported" />
             </div>
             <div className="text-[var(--ink)] font-medium">
               {(hoursSub?.miles ?? 0).toFixed(1)} mi
             </div>
           </div>
         </div>

         <div className="space-y-4">
           <div>
             <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
               <span>Reported actual time</span>
               <CopyButton text={actualStr} label="reported actual time" />
             </div>
             <div className="text-[var(--ink)] font-medium">{actualStr}</div>
           </div>
           <div>
             <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
               <span>Service time</span>
               <CopyButton text={serviceTimeStr} label="service time" />
             </div>
             <div className="text-[var(--ink)] font-medium">{serviceTimeStr}</div>
           </div>
           <div>
             <div className="text-[var(--sage)] mb-1">Mileage approved by agency</div>
             <div className="text-[var(--ink)] font-medium">
               {hoursSub?.approvedMileage !== null && hoursSub?.approvedMileage !== undefined
                 ? `${Number(hoursSub.approvedMileage).toFixed(1)} mi approved`
                 : 'Not approved yet'}
             </div>
           </div>
         </div>
       </div>

       {(hoursSub?.mileageNote || hoursSub?.note) && (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6 border-t border-gray-100 pt-4">
           {hoursSub.mileageNote && (
             <div>
               <div className="text-[var(--sage)] text-xs mb-1 flex items-center justify-between">
                 <span>Mileage note</span>
                 <CopyButton text={hoursSub.mileageNote} label="mileage note" />
               </div>
               <div className="text-[var(--ink)] text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                 {hoursSub.mileageNote}
               </div>
             </div>
           )}
           {hoursSub.note && (
             <div>
               <div className="text-[var(--sage)] text-xs mb-1 flex items-center justify-between">
                 <span>Service note</span>
                 <CopyButton text={hoursSub.note} label="service note" />
               </div>
               <div className="text-[var(--ink)] text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                 {hoursSub.note}
               </div>
             </div>
           )}
         </div>
       )}

       <div className="pt-2">
         <Link href="/hours-review" className="text-sm font-medium text-[var(--forest)] hover:underline inline-flex items-center gap-1">
           Open in Hours Review queue →
         </Link>
       </div>
     </div>
   );
 })()}

 {!isCancelled && (
 <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 border border-gray-200/50 shadow-none mb-4">
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-4">Staffing</h2>
 <p className="text-sm text-[var(--sage)] mb-1">Pending offers do not reserve time.</p>
 <p className="text-sm text-[var(--sage)] mb-6">Back-to-back appointments are allowed. Travel time is not checked.</p>
 
 <h3 className="font-semibold text-[var(--ink)] mb-2">Position 1 · interpreter</h3>
 
 <div className="flex flex-wrap gap-2 mb-3">
 <span className={`px-3 py-1 text-[12px] font-medium rounded-full ${dbAcceptedOffer ? 'bg-green-100 text-green-700' : 'bg-[#FEF3C7] text-[#92400E]'}`}>
 Booking: {dbAcceptedOffer ? 'Filled' : 'Unfilled'}
 </span>
 <span className="px-3 py-1 bg-white border border-gray-200 text-gray-600 text-[12px] font-medium rounded-full ">Access: Available</span>
 </div>
 
 <p className="text-sm text-gray-700 mt-3 mb-4">
 Assigned interpreter: <span className="text-[var(--sage)]">{dbAcceptedOffer ? dbAcceptedOffer.interpreterName : 'Unfilled'}</span>
 </p>

 {!dbAcceptedOffer ? (
 <>
 {dbPastOffers.length > 0 && (
 <div className="bg-[#F5F4F0] rounded-xl p-4 mb-6">
 <div className="flex items-center gap-2 mb-3">
 <ChevronDown className="w-4 h-4 text-gray-700" />
 <span className="font-medium text-sm text-[var(--ink)]">Previous offers ({dbPastOffers.length})</span>
 </div>
 {dbPastOffers.map((offer: any, idx: number) => (
 <div key={idx} className="mb-3 last:mb-0">
 <div className="flex items-center gap-2 pl-6 flex-wrap">
 <span className="text-xs sm:text-sm text-gray-600">{offer.interpreterName} ·</span>
 <span className="bg-white border border-gray-200 text-gray-600 text-[11px] font-medium px-2 py-0.5 rounded-full capitalize">{offer.state}</span>
 </div>
 <div className="text-xs sm:text-sm text-[var(--sage)] pl-6 mt-1 text-wrap">{offer.state} {(() => {
   try {
     const d = parseSafeDate(offer.expiresAt);
     if (!d) return '';
     return formatInTimeZone(d, mapSafeZone(assignment.details?.timeZone), 'MMM d, h:mm a');
   } catch (e) {
     return '';
   }
 })()}</div>
 </div>
 ))}
 </div>
 )}

 {dbActiveOffer ? (
 <div className="bg-[#F5F4F0] p-4 rounded-xl mb-4">
 <div className="flex items-center gap-2">
 <span className="text-[var(--ink)] font-medium">{dbActiveOffer.interpreterName}</span>
 <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold capitalize">{dbActiveOffer.state}</span>
 </div>
 <p className="text-sm text-[var(--sage)] mt-2 mb-4">
 Response due {(() => {
   try {
     const d = parseSafeDate(dbActiveOffer.expiresAt);
     if (!d) return 'Unknown';
     return formatInTimeZone(d, mapSafeZone(assignment.details?.timeZone), 'MM/dd/yyyy h:mm:ss a');
   } catch (e) {
     return 'Unknown';
   }
 })()}
 </p>
 <button 
 onClick={async () => {
   try {
     await updateOfferStatus(dbActiveOffer.id, 'withdrawn');
     const updatedRequest = await fetchLiveRequestById(id);
     setFoundRequest(updatedRequest);
   } catch (err) {
     console.error(err);
   }
 }}
 className="bg-white border border-gray-300 rounded-full px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
 >
 Withdraw offer
 </button>
 </div>
 ) : (
 <>
 <label className="flex items-start gap-3 cursor-pointer mb-6">
 <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]" />
 <span className="text-sm text-gray-700">Deliberately offer this slot to multiple interpreters</span>
 </label>

 <div className="space-y-4">
 <div>
 <label className="block text-sm text-[var(--sage)] mb-2">Select one recipient</label>
 <select 
 className="w-full bg-[#F5F4F0] border-none rounded-full px-4 py-3 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow appearance-none"
 value={recipient}
 onChange={(e) => setRecipient(e.target.value)}
 >
 <option value="">Choose an interpreter</option>
 {activeRoster.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
 </select>
 </div>
 
 <div>
 <label className="block text-sm text-[var(--sage)] mb-2">Offer expiry</label>
 <div className="flex flex-col sm:flex-row gap-4 w-full">
 <div className="flex-1 relative w-full">
 <input 
 type="date" 
 className="w-full bg-[#F5F4F0] border-none rounded-full px-4 py-3 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow" 
 value={expiryDate}
 onChange={(e) => {
 setExpiryDate(e.target.value);
 setErrorMessage('');
 if (!expiryTime) {
 setExpiryTime('09:00');
 }
 }}
 />
 </div>
 <div className="flex-1 relative w-full">
 <input 
 type="time" 
 className="w-full bg-[#F5F4F0] border-none rounded-full px-4 py-3 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow" 
 value={expiryTime}
 onChange={(e) => {
 setExpiryTime(e.target.value);
 setErrorMessage('');
 }}
 />
 </div>
 </div>
 <p className="text-xs text-[var(--sage)] mt-2 mb-2">Choose a future expiration before the appointment starts. No messages are sent outside this workspace.</p>
 {errorMessage && <p className="text-[#C23B22] text-sm mb-4">{errorMessage}</p>}
 </div>

 <button 
 onClick={handleCreateOffer}
 disabled={!recipient}
 className={`rounded-full px-6 py-2 text-sm font-medium transition-colors mt-2 w-auto ${
 !recipient 
 ? 'bg-[#8BA49E] text-white opacity-50 cursor-not-allowed' 
 : 'bg-[#145347] text-white hover:bg-[#0f4037] cursor-pointer'
 }`}
 >
 Create offer
 </button>
 </div>

 {/* Auto-book Section */}
 <div className="bg-[#F5F4F0] p-4 md:p-5 rounded-xl mt-6">
 <h4 className="font-semibold text-sm text-[var(--ink)] mb-1">Auto-book with the interpreter's permission</h4>
 <p className="text-xs text-gray-600 mb-4 leading-relaxed">
 Books without waiting for an acceptance, and only for interpreters who have given your agency that permission. Virtual appointments only for now — travel time is not checked. Qualifications and rates are not checked either.
 </p>
 
 <div className="space-y-4">
 <div>
 <label className="block text-sm text-[var(--sage)] mb-2">Interpreter</label>
 <select 
 className="w-full bg-white border border-gray-200 rounded-full px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow appearance-none"
 value={autoBookRecipient}
 onChange={(e) => {
 const val = e.target.value;
 setAutoBookRecipient(val);
 if (val) {
 const interpreter = activeRoster.find(i => i.id === val);
 setIsEligible(interpreter?.isAutoFillEligible ?? null);
 } else {
 setIsEligible(null);
 }
 }}
 >
 <option value="">Choose an interpreter</option>
 {activeRoster.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
 </select>
 </div>
 {isEligible === false && <p className="text-[var(--sage)] text-sm mb-4">Not eligible for Auto Fill: This interpreter is not sharing availability with your agency. You can still send an offer.</p>}
 <button 
 onClick={handleAutoBook}
 disabled={!autoBookRecipient || isEligible === false}
 className={`rounded-full px-6 py-2 text-sm font-medium transition-colors w-full sm:w-auto ${
 !autoBookRecipient || isEligible === false
 ? 'bg-[#8BA49E] text-white opacity-50 cursor-not-allowed'
 : 'bg-[#145347] text-white hover:bg-[#0f4037] cursor-pointer'
 }`}
 >
 Auto-book this interpreter
 </button>
 </div>
 </div>
 </>
 )}
 </>
 ) : (
 <div className="bg-[#F5F4F0] p-4 rounded-xl mb-4">
 <div className="flex items-center justify-between">
   <div className="flex items-center gap-2">
     <span className="text-sm text-[var(--ink)] font-medium">{dbAcceptedOffer.interpreterName}</span>
     <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-semibold capitalize">Assigned</span>
   </div>
   <button 
   onClick={async () => {
     try {
       await updateOfferStatus(dbAcceptedOffer.id, 'withdrawn');
       const updatedRequest = await fetchLiveRequestById(id);
       setFoundRequest(updatedRequest);
     } catch (err) {
       console.error(err);
     }
   }}
   className="text-[var(--sage)] hover:text-red-600 text-sm font-medium transition-colors"
   >
   Remove booking
   </button>
 </div>
 </div>
 )}

 <div className="mt-6">
 <Link href="#" className="text-sm text-[var(--sage)] hover:text-[var(--ink)] transition-colors">
 Manage access
 </Link>
 </div>
 </div>
 )}

 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Agency-private notes</h2>
 <p className="text-gray-800 text-[15px] leading-relaxed">
 {assignment.privateNotes}
 </p>
 </div>

 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Activity</h2>
 <p className="text-[var(--sage)] text-sm">
 {assignment.activity}
 </p>
 </div>

 </div>

 {showCancelModal && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
 <div className="bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-[500px] mx-auto shadow-xl">
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-[22px] font-medium text-[var(--ink)]">Cancel appointment</h3>
 <button onClick={() => setShowCancelModal(false)} className="text-gray-400 hover:text-gray-600">
 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
 </button>
 </div>
 
 <p className="text-[15px] text-gray-600 mb-6 leading-relaxed">
 Every position on this appointment will be cancelled. Booked interpreters lose the assignment and their reserved time is released, pending offers are closed, and nobody can accept or be auto-booked afterwards. Affected interpreters are told in the app. The appointment and its history are kept, not deleted, and the original scheduled times stay on record.
 </p>
 
 <div className="mb-6 space-y-4">
 <div>
 <label className="block text-sm text-gray-600 mb-2">Internal reason (agency only)</label>
 <input 
 type="text" 
 value={cancelReasonInput}
 onChange={(e) => setCancelReasonInput(e.target.value)}
 className="w-full bg-[#F5F4F0] border-none rounded-2xl px-4 py-3.5 text-sm text-[var(--ink)] focus:ring-2 focus:ring-[#0B3B32] outline-none" 
 />
 </div>
 
 <label className="flex items-center gap-3 cursor-pointer">
 <input 
 type="checkbox" 
 checked={clientRequested}
 onChange={(e) => setClientRequested(e.target.checked)}
 className="h-5 w-5 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]" 
 />
 <span className="text-[15px] text-gray-800">The client requested this cancellation</span>
 </label>
 
 <p className="text-sm text-[var(--sage)] pt-2">No cancellation charge is calculated and no pay decision is made here.</p>
 </div>
 
 <div className="flex justify-end gap-3 flex-col sm:flex-row mt-8">
 <button 
 onClick={() => setShowCancelModal(false)} 
 className="w-full sm:w-auto px-5 py-2.5 rounded-full text-[15px] font-medium border border-gray-300 hover:bg-gray-50 text-gray-700 transition-colors"
 >
 Keep this appointment
 </button>
 <button 
 onClick={confirmCancelAppointment} 
 disabled={!cancelReasonInput.trim()}
 className={`w-full sm:w-auto px-5 py-2.5 rounded-full text-[15px] font-medium transition-colors ${!cancelReasonInput.trim() ? 'bg-[#E5B5B0] text-white opacity-70 cursor-not-allowed' : 'bg-[#C28C84] text-white hover:bg-[#B37C74]'}`}
 >
 Cancel all positions
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
