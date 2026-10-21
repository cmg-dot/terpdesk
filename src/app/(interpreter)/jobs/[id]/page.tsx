"use client";

import React, { useState, useEffect, useTransition, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, MapPin, Copy, Check, Building2, ExternalLink, Video, Lock } from "lucide-react";
import { useInterpreterJobs } from "@/context/InterpreterJobsContext";
import { JobPrepMaterials } from "@/components/prep/JobPrepMaterials";
import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { giveBackAssignment } from "@/app/actions/giveBackAssignment";
import { submitInterpreterHours } from "@/app/actions/submitInterpreterHours";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { UpdatedBadge, UpdatedNotice } from "@/components/jobDetails/UpdatedBadge";
import { JobQuestionsAndMessages } from "@/components/jobDetails/JobQuestionsAndMessages";
import { formatReference } from "@/utils/statusEngine";
import { resolveRequestTimes } from "@/utils/timezone";
import { findOwnServiceRecord, getJobHoursState, scopedRequestStatus } from "@/utils/hoursState";
import { buildOdhhPortalUrl } from "@/lib/odhhPortal";
import { InterpreterSubmitForm } from "@/components/features/InterpreterSubmitForm";
import { splitTimesheetError } from "@/lib/timesheetErrors";
import type { DateFieldErrors } from "@/lib/timesheetErrors";

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

const formatDetailsDate = (startStr?: string | Date | null, endStr?: string | Date | null, timeZone?: string) => {
  try {
    if (!startStr) return "Date TBD";
    const start = new Date(startStr);
    if (isNaN(start.getTime())) return "Date TBD";
    const safeZone = mapSafeZone(timeZone);
    
    const dateStart = formatInTimeZone(start, safeZone, "EEE, MMM d");
    const timeStart = formatInTimeZone(start, safeZone, "h:mm a");
    
    let timeEnd = "";
    if (endStr) {
      const end = new Date(endStr);
      if (!isNaN(end.getTime())) {
        timeEnd = formatInTimeZone(end, safeZone, "h:mm a zzz");
      }
    }
    if (!timeEnd) {
       timeEnd = formatInTimeZone(start, safeZone, "h:mm a zzz");
    }
    
    return `${dateStart} · ${timeStart} - ${timeEnd}`;
  } catch (e) {
    return "Date TBD";
  }
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
      ? formatInTimeZone(end, safeZone, "h:mm a") 
      : formatInTimeZone(start, safeZone, "h:mm a");
    
    return `${dateStr} · ${timeStart} - ${timeEnd}`;
  } catch (error) {
    return "Date TBD";
  }
};

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

function buildAuditLog(serviceRecord: any, job: any, isOdhh: boolean) {
  if (Array.isArray(serviceRecord?.history) && serviceRecord.history.length > 0) {
    return serviceRecord.history;
  }
  if (!serviceRecord) return [];

  const events: any[] = [];
  const version = serviceRecord.version || 1;
  // Team jobs: the request-wide status covers both positions, so it never decides this interpreter's history.
  const ownRequestStatus = job ? scopedRequestStatus(job) : '';
  const isApproved = serviceRecord.state === 'approved' || ['approved', 'completed', 'billed'].includes(ownRequestStatus);
  const isCorrectionReq = serviceRecord.state === 'changes_requested' || serviceRecord.state === 'correction_requested' || ownRequestStatus === 'correction_requested';
  const hasAgencyMessage = Boolean(serviceRecord.reviewMessage);

  // 1. Initial Submission
  events.push({
    id: 'evt-init',
    type: 'initial_submission',
    title: 'Initial hours submitted',
    actor: 'Jamie Fictional (Interpreter)',
    timestamp: serviceRecord.submittedAt || serviceRecord.scheduledEnd || job?.startsAt || new Date().toISOString(),
    version: 1,
    details: {
      actualStart: serviceRecord.actualStart,
      actualEnd: serviceRecord.actualEnd,
      mileage: serviceRecord.reportedMileage,
      travelStart: isOdhh ? serviceRecord.travelStart : undefined,
      travelEnd: isOdhh ? serviceRecord.travelEnd : undefined,
      serviceCompleted: isOdhh ? (serviceRecord.serviceCompleted === 'no' || serviceRecord.serviceCompleted === false ? 'No' : 'Yes') : undefined,
      breakMinutes: !isOdhh ? serviceRecord.breakMinutes : undefined,
      mileageNote: serviceRecord.mileageNote,
      serviceNote: serviceRecord.serviceNote,
    }
  });

  // 2. Correction Requested by agency
  if (version > 1 || isCorrectionReq || hasAgencyMessage) {
    events.push({
      id: 'evt-corr-req',
      type: 'correction_requested',
      title: 'Correction requested by agency',
      actor: 'Agency Staff',
      timestamp: serviceRecord.correctionRequestedAt || new Date().toISOString(),
      version: 1,
      message: serviceRecord.reviewMessage || "Agency requested adjustments to reported actual hours and travel details.",
    });
  }

  // 3. Correction Submitted by interpreter (Version 2+)
  if (version > 1 && !isCorrectionReq) {
    events.push({
      id: 'evt-corr-sub',
      type: 'correction_submitted',
      title: `Correction submitted (v${version})`,
      actor: 'Jamie Fictional (Interpreter)',
      timestamp: serviceRecord.updatedAt || new Date().toISOString(),
      version: version,
      details: {
        actualStart: serviceRecord.actualStart,
        actualEnd: serviceRecord.actualEnd,
        mileage: serviceRecord.reportedMileage,
        travelStart: isOdhh ? serviceRecord.travelStart : undefined,
        travelEnd: isOdhh ? serviceRecord.travelEnd : undefined,
        serviceCompleted: isOdhh ? (serviceRecord.serviceCompleted === 'no' || serviceRecord.serviceCompleted === false ? 'No' : 'Yes') : undefined,
        breakMinutes: !isOdhh ? serviceRecord.breakMinutes : undefined,
        mileageNote: serviceRecord.mileageNote,
        serviceNote: serviceRecord.serviceNote,
      }
    });
  }

  // 4. Hours approved and finalized by agency
  if (isApproved) {
    events.push({
      id: 'evt-approved',
      type: 'approved',
      title: 'Hours approved and finalized',
      actor: 'Agency Staff',
      timestamp: serviceRecord.approvedAt || new Date().toISOString(),
      version: version,
      details: {
        approvedMileage: serviceRecord.approvedMileage !== null && serviceRecord.approvedMileage !== undefined 
          ? serviceRecord.approvedMileage 
          : serviceRecord.reportedMileage,
      }
    });
  }

  return events;
}

function VersionHistoryAuditLog({ 
  events, 
  timeZone 
}: { 
  events: any[]; 
  timeZone?: string 
}) {
  if (!events || events.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 mb-6">
        No version history recorded yet.
      </div>
    );
  }

  const safeZone = mapSafeZone(timeZone);

  const formatEventTime = (iso?: string) => {
    try {
      if (!iso) return "";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return formatInTimeZone(d, safeZone, "MMM d, yyyy · h:mm a zzz");
    } catch (e) {
      return iso || "";
    }
  };

  return (
    <div className="border border-gray-200 rounded-2xl bg-gray-50/80 p-5 mb-6">
      <div className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center justify-between">
        <span>Audit Log & Version History</span>
        <span className="text-[11px] font-normal text-gray-500 lowercase">({events.length} {events.length === 1 ? 'event' : 'events'})</span>
      </div>
      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
        {events.map((evt, idx) => {
          const isApprove = evt.type === 'approved';
          const isCorrectionReq = evt.type === 'correction_requested';
          const isSubmission = evt.type === 'initial_submission' || evt.type === 'correction_submitted';

          const dotColor = isApprove 
            ? 'bg-green-600 ring-green-100' 
            : isCorrectionReq 
              ? 'bg-amber-500 ring-amber-100' 
              : 'bg-[#1B433C] ring-emerald-100';

          return (
            <div key={evt.id || idx} className="relative">
              <div className={`absolute -left-6 top-1.5 w-3 h-3 rounded-full ${dotColor} ring-4`} />
              
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--ink)]">{evt.title}</span>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                      v{evt.version || 1}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--sage)]">
                    {formatEventTime(evt.timestamp)}
                  </span>
                </div>

                <div className="text-xs text-gray-500">
                  By <span className="font-medium text-gray-700">{evt.actor || 'System'}</span>
                </div>

                {isSubmission && evt.details && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-gray-50 rounded-lg p-3 border border-gray-100 mt-2">
                    {evt.details.actualStart && evt.details.actualEnd && (
                      <div>
                        <span className="text-[var(--sage)]">Reported time: </span>
                        <span className="font-medium text-[var(--ink)]">
                          {formatJobDate(evt.details.actualStart, evt.details.actualEnd, timeZone)}
                        </span>
                      </div>
                    )}
                    {evt.details.serviceTime && (
                      <div>
                        <span className="text-[var(--sage)]">Service duration: </span>
                        <span className="font-medium text-[var(--ink)]">{evt.details.serviceTime}</span>
                      </div>
                    )}
                    {evt.details.mileage !== undefined && (
                      <div>
                        <span className="text-[var(--sage)]">Mileage: </span>
                        <span className="font-medium text-[var(--ink)]">
                          {Number(evt.details.mileage).toFixed(1)} mi
                        </span>
                      </div>
                    )}
                    {evt.details.travelStart && evt.details.travelEnd && (
                      <div>
                        <span className="text-[var(--sage)]">Travel: </span>
                        <span className="font-medium text-[var(--ink)]">
                          {formatJobDate(evt.details.travelStart, evt.details.travelEnd, timeZone)}
                        </span>
                      </div>
                    )}
                    {evt.details.serviceCompleted !== undefined && (
                      <div>
                        <span className="text-[var(--sage)]">Completed: </span>
                        <span className="font-medium text-[var(--ink)]">
                          {evt.details.serviceCompleted === 'no' || evt.details.serviceCompleted === false ? 'No' : 'Yes'}
                        </span>
                      </div>
                    )}
                    {evt.details.breakMinutes !== undefined && evt.details.breakMinutes > 0 && (
                      <div>
                        <span className="text-[var(--sage)]">Unpaid break: </span>
                        <span className="font-medium text-[var(--ink)]">{evt.details.breakMinutes} min</span>
                      </div>
                    )}
                    {evt.details.mileageNote && (
                      <div className="sm:col-span-2">
                        <span className="text-[var(--sage)]">Mileage note: </span>
                        <span className="text-gray-700">{evt.details.mileageNote}</span>
                      </div>
                    )}
                    {evt.details.serviceNote && (
                      <div className="sm:col-span-2">
                        <span className="text-[var(--sage)]">Service note: </span>
                        <span className="text-gray-700">{evt.details.serviceNote}</span>
                      </div>
                    )}
                  </div>
                )}

                {isCorrectionReq && evt.message && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-xs mt-2">
                    <span className="font-semibold block mb-0.5">Agency feedback / correction reason:</span>
                    <p className="leading-relaxed">{evt.message}</p>
                  </div>
                )}

                {isApprove && (
                  <div className="bg-green-50 border border-green-200 text-green-900 rounded-lg p-3 text-xs mt-2">
                    <span className="font-semibold block mb-0.5">Approval confirmation:</span>
                    <p>
                      Service confirmed. Approved mileage: {evt.details?.approvedMileage !== undefined ? `${Number(evt.details.approvedMileage).toFixed(1)} mi` : 'Accepted as reported'}. Pay and billing are separate from this approval.
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ServiceTimeBlock({ job }: { job: any }) {
  const [serviceRecord, setServiceRecord] = useState<any>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const router = useRouter();
  const [isSubmitting, startSubmit] = useTransition();

  const toLocalInput = (iso?: string | null) => {
    try {
      if (!iso) return "";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return formatInTimeZone(d, mapSafeZone((job as any).details?.timeZone || job.timeZone), "yyyy-MM-dd'T'HH:mm");
    } catch (error) {
      return "";
    }
  };
  const [actualStart, setActualStart] = useState(() => toLocalInput(job.startsAt));
  const [actualEnd, setActualEnd] = useState(() => toLocalInput(job.endsAt));
  const [breakMinutes, setBreakMinutes] = useState("0");
  
  type MileageLeg = { id: number, from: string, to: string, distance: number | string, type: 'total' | 'round_trip' };
  const [mileageLegs, setMileageLegs] = useState<MileageLeg[]>([]);
  const [mileageNote, setMileageNote] = useState("");
  const [note, setNote] = useState("");

  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  const isOdhh = job.program === 'wa_odhh' || job.program === 'WA ODHH' || (job as any).data?.intake?.program === 'WA ODHH' || (job as any).data?.intake?.program === 'wa_odhh';
  const [travelStart, setTravelStart] = useState(() => toLocalInput(job.startsAt));
  const [travelEnd, setTravelEnd] = useState(() => toLocalInput(job.endsAt));
  const [serviceCompleted, setServiceCompleted] = useState<string>("yes");
  const [cancellationReason, setCancellationReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<DateFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const loadRecord = () => {
      let found: any = null;
      let local: any = null;
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('terpdesk_service_records');
        if (stored) {
          try {
            const records = JSON.parse(stored);
            // Only this booking's own cached record (by offer id), never another interpreter's on the same job.
            local = findOwnServiceRecord(records, job) || null;
          } catch (e) {
            console.error(e);
          }
        }
      }
      const hs = (job as any).hoursSubmission || {};
      // Server-side state (covers hours sent through the emailed secure link as well as in-app ones).
      const serverState = getJobHoursState(job);
      // Request-level travel columns are a Position 1 legacy field; on a team job they never stand in for Position 2.
      const isPos1 = ((job as any).positionIndex ?? 1) === 1;
      const serverHasHours = Boolean((job as any).hoursSubmission || (isPos1 && (job as any).travelStartTime)) || serverState !== 'not_submitted';
      // The database is the source of truth; a browser copy only wins while it holds newer, unsent work.
      const localIsNewer = local && Number(local.version || 1) > Number(hs.version || 1);
      const serverIsFinal = serverState === 'approved' || serverState === 'awaiting_review';
      if (local && !(serverHasHours && serverIsFinal && !localIsNewer)) found = local;
      if (!found && serverHasHours) {
        found = {
          id: (job as any).requestId || job.id,
          appointmentId: (job as any).requestId || job.id,
          interpreterName: "Jamie Fictional",
          state: serverState === 'not_submitted' ? 'awaiting_review' : serverState,
          scheduledStart: job.startsAt,
          scheduledEnd: job.endsAt,
          actualStart: hs.actualStartTime || job.startsAt,
          actualEnd: hs.actualEndTime || job.endsAt,
          breakMinutes: hs.breakMinutes || 0,
          reportedMileage: hs.miles || 0,
          mileageNote: hs.mileageNote || "",
          serviceNote: hs.note || "",
          travelStart: hs.travelStartTime || (isPos1 ? (job as any).travelStartTime : null) || job.startsAt,
          travelEnd: hs.travelEndTime || (isPos1 ? (job as any).travelEndTime : null) || job.endsAt,
          serviceCompleted: hs.serviceCompleted ?? (isPos1 ? (job as any).serviceCompleted : null) ?? "yes",
          isOdhh: isOdhh,
          approvedMileage: hs.approvedMileage ?? null,
          reviewMessage: hs.reviewMessage ?? null,
          version: hs.version || 1,
          history: hs.history || []
        };
      }
      if (found) {
        setServiceRecord(found);
        if (found.actualStart) setActualStart(toLocalInput(found.actualStart));
        if (found.actualEnd) setActualEnd(toLocalInput(found.actualEnd));
        if (found.breakMinutes !== undefined) setBreakMinutes(String(found.breakMinutes));
        if (found.travelStart) setTravelStart(toLocalInput(found.travelStart));
        if (found.travelEnd) setTravelEnd(toLocalInput(found.travelEnd));
        if (found.serviceCompleted !== undefined && found.serviceCompleted !== null) {
          setServiceCompleted(typeof found.serviceCompleted === 'boolean' ? (found.serviceCompleted ? 'yes' : 'no') : String(found.serviceCompleted));
        }
        if (found.mileageNote) setMileageNote(found.mileageNote);
        if (found.cancellationReason) setCancellationReason(found.cancellationReason);
        if (found.serviceNote) setNote(found.serviceNote);
      }
    };
    loadRecord();
    window.addEventListener('storage', loadRecord);
    return () => window.removeEventListener('storage', loadRecord);
  }, [job.id, job.requestId, job.requestStatus, (job as any).hoursSubmission?.status, (job as any).hoursSubmission?.submittedAt]);

  if (job.status !== 'booked') return null;

  const { startsAt: resolvedStartsAt, endsAt: resolvedEndsAt } = resolveRequestTimes(job);
  const startsAtMs = new Date(resolvedStartsAt).getTime();
  const endsAtMs = new Date(resolvedEndsAt).getTime();
  const nowMs = Date.now();
  const isFutureAppointment = nowMs < startsAtMs;
  const isPastEndTime = nowMs > endsAtMs;

  const totalMileage = mileageLegs.reduce((acc, leg) => {
    const dist = parseFloat(leg.distance as string) || 0;
    const multiplier = leg.type === 'round_trip' ? 2 : 1;
    return acc + (dist * multiplier);
  }, 0);

  // The unpaid break only exists on private jobs; ODHH reports travel instead.
  const effectiveBreakMinutes = isOdhh ? 0 : Math.max(0, parseInt(breakMinutes) || 0);

  const handleSaveDraft = () => {
    if (Date.now() < startsAtMs) {
      alert("Actual service time can be entered once the appointment starts.");
      return;
    }

    const draftRecord = {
      id: serviceRecord?.id || Math.random().toString(36).substring(7),
      appointmentId: job.requestId || job.id,
      // Ties the cached record to THIS booking, so it never shows on another interpreter's job.
      offerId: job.id,
      interpreterName: "Jamie Fictional",
      state: 'draft',
      scheduledStart: job.startsAt,
      scheduledEnd: job.endsAt,
      actualStart: actualStart || job.startsAt,
      actualEnd: actualEnd || job.endsAt,
      breakMinutes: effectiveBreakMinutes,
      reportedMileage: totalMileage,
      mileageNote: mileageNote,
      serviceNote: note,
      travelStart: travelStart || job.startsAt,
      travelEnd: travelEnd || job.endsAt,
      serviceCompleted: serviceCompleted,
      isOdhh: isOdhh,
      approvedMileage: serviceRecord?.approvedMileage ?? null,
      reviewMessage: serviceRecord?.reviewMessage ?? null,
      version: serviceRecord?.version || 1
    };

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('terpdesk_service_records');
      const records = stored ? JSON.parse(stored) : [];
      const idx = records.findIndex((r: any) => r?.offerId === job.id);
      if (idx > -1) {
        records[idx] = draftRecord;
      } else {
        records.push(draftRecord);
      }
      localStorage.setItem('terpdesk_service_records', JSON.stringify(records));
      window.dispatchEvent(new Event('storage'));
    }

    setServiceRecord(draftRecord);
    setIsFormOpen(false);
  };

  const handleSubmit = () => {
    if (Date.now() < startsAtMs) {
      alert("Actual service time can be entered once the appointment starts.");
      return;
    }
    if (!signatureDataUrl) return;
    if (isOdhh && serviceCompleted === 'no' && !cancellationReason.trim()) {
      alert("Please give a reason the service was not completed.");
      return;
    }
    const isCorrection = serviceRecord?.state === 'approved' || serviceRecord?.state === 'changes_requested' || serviceRecord?.state === 'correction_requested' || scopedRequestStatus(job) === 'correction_requested';
    const nextVersion = isCorrection ? (serviceRecord?.version || 1) + 1 : (serviceRecord?.version || 1);

    const safeZone = mapSafeZone((job as any).details?.timeZone || job.timeZone);
    const getIsoString = (val?: string | null) => {
      try {
        if (!val) return null;
        if (val.includes('Z')) return val;
        return fromZonedTime(val, safeZone).toISOString();
      } catch (e) {
        return val;
      }
    };

    const startIso = getIsoString(actualStart || job.startsAt) || job.startsAt;
    const endIso = getIsoString(actualEnd || job.endsAt) || job.endsAt;
    const travelStartIso = isOdhh ? (getIsoString(travelStart || job.startsAt) || job.startsAt) : null;
    const travelEndIso = isOdhh ? (getIsoString(travelEnd || job.endsAt) || job.endsAt) : null;

    const currentHistory = Array.isArray(serviceRecord?.history) && serviceRecord.history.length > 0
      ? serviceRecord.history
      : buildAuditLog(serviceRecord, job, isOdhh);

    const submissionEvent = {
      id: Math.random().toString(36).substring(7),
      type: isCorrection ? 'correction_submitted' : 'initial_submission',
      title: isCorrection ? `Correction submitted (v${nextVersion})` : 'Initial hours submitted',
      actor: 'Jamie Fictional (Interpreter)',
      timestamp: new Date().toISOString(),
      version: nextVersion,
      details: {
        actualStart: actualStart || job.startsAt,
        actualEnd: actualEnd || job.endsAt,
        mileage: totalMileage,
        breakMinutes: effectiveBreakMinutes,
        travelStart: travelStart || job.startsAt,
        travelEnd: travelEnd || job.endsAt,
        serviceCompleted: serviceCompleted,
        mileageNote: mileageNote,
        serviceNote: note,
      }
    };

    const updatedHistory = [...currentHistory, submissionEvent];

    const newRecord = {
      id: serviceRecord?.id || Math.random().toString(36).substring(7),
      appointmentId: job.requestId || job.id,
      // Ties the cached record to THIS booking, so it never shows on another interpreter's job.
      offerId: job.id,
      interpreterName: "Jamie Fictional",
      state: 'awaiting_review',
      scheduledStart: job.startsAt,
      scheduledEnd: job.endsAt,
      actualStart: actualStart || job.startsAt,
      actualEnd: actualEnd || job.endsAt,
      breakMinutes: effectiveBreakMinutes,
      reportedMileage: totalMileage,
      mileageNote: mileageNote,
      serviceNote: note,
      travelStart: travelStart || job.startsAt,
      travelEnd: travelEnd || job.endsAt,
      serviceCompleted: serviceCompleted,
      cancellationReason: serviceCompleted === 'no' ? cancellationReason.trim() : null,
      isOdhh: isOdhh,
      approvedMileage: null,
      reviewMessage: null,
      version: nextVersion,
      submittedAt: new Date().toISOString(),
      history: updatedHistory
    };

    const previousRequestStatus = job.requestStatus;
    setFieldErrors({});
    setSubmitError(null);
    job.requestStatus = 'awaiting_review';
    if ((job as any).hoursSubmission) {
      (job as any).hoursSubmission.reviewMessage = null;
      (job as any).hoursSubmission.approvedMileage = null;
      (job as any).hoursSubmission.version = nextVersion;
      (job as any).hoursSubmission.history = updatedHistory;
    }

    startSubmit(async () => {
      try {
        await submitInterpreterHours(job.requestId || job.id, startIso, endIso, totalMileage, {
          breakMinutes: effectiveBreakMinutes,
          travelStartTime: travelStartIso,
          travelEndTime: travelEndIso,
          serviceCompleted: isOdhh ? serviceCompleted : null,
          mileageNote: mileageNote,
          note: note,
          version: nextVersion,
          history: updatedHistory,
          positionIndex: (job as any).positionIndex || 1,
          signatureDataUrl,
          cancellationReason: isOdhh && serviceCompleted === 'no' ? cancellationReason.trim() : undefined,
          legs: mileageLegs.map(leg => ({
            fromLabel: leg.from,
            toLabel: leg.to,
            miles: parseFloat(String(leg.distance)) || 0,
            roundTrip: leg.type === 'round_trip',
          })),
        });
      } catch (err) {
        // Restore the optimistic status and show the message next to the field it belongs to.
        job.requestStatus = previousRequestStatus;
        const message = err instanceof Error && err.message ? err.message : "Could not submit your hours. Please try again.";
        const split = splitTimesheetError(message);
        setFieldErrors(split.fieldErrors);
        setSubmitError(split.formError);
        return;
      }

      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('terpdesk_service_records');
        const records = stored ? JSON.parse(stored) : [];
        const idx = records.findIndex((r: any) => r?.offerId === job.id);
        if (idx > -1) {
          records[idx] = newRecord;
        } else {
          records.push(newRecord);
        }
        localStorage.setItem('terpdesk_service_records', JSON.stringify(records));
        window.dispatchEvent(new Event('storage'));
      }

      setServiceRecord(newRecord);
      setIsFormOpen(false);
      router.refresh();
    });
  };

  let serviceTimeHours = "-";
  if (actualStart && actualEnd) {
    const start = new Date(actualStart).getTime();
    const end = new Date(actualEnd).getTime();
    if (!isNaN(start) && !isNaN(end)) {
      const diffMs = end - start;
      const mins = Math.max(0, (diffMs / 60000) - (effectiveBreakMinutes));
      serviceTimeHours = (mins / 60).toFixed(1) + " hr";
    }
  }

  const addMileageLeg = () => {
    setMileageLegs([...mileageLegs, { id: Date.now(), from: '', to: '', distance: '', type: 'total' }]);
  };

  const removeMileageLeg = (id: number) => {
    setMileageLegs(mileageLegs.filter(leg => leg.id !== id));
  };

  const updateMileageLeg = (id: number, field: keyof MileageLeg, value: any) => {
    setMileageLegs(mileageLegs.map(leg => leg.id === id ? { ...leg, [field]: value } : leg));
  };

  const currentState: 'not_submitted' | 'draft' | 'awaiting_review' | 'correction_requested' | 'approved' = (() => {
    if (serviceRecord?.state === 'submitted' || serviceRecord?.state === 'awaiting_review') {
      return 'awaiting_review';
    }
    if (serviceRecord?.state === 'approved') {
      return 'approved';
    }
    if (serviceRecord?.state === 'changes_requested' || serviceRecord?.state === 'correction_requested') {
      return 'correction_requested';
    }
    if (serviceRecord?.state === 'draft') {
      return 'draft';
    }

    // Request-wide status only for single-interpreter jobs; on a team job it reflects the other position too.
    const ownRequestStatus = scopedRequestStatus(job);
    if (ownRequestStatus === 'awaiting_review') {
      return 'awaiting_review';
    }
    if (ownRequestStatus === 'approved' || ['completed', 'billed'].includes(ownRequestStatus)) {
      return 'approved';
    }
    if (ownRequestStatus === 'correction_requested') {
      return 'correction_requested';
    }

    return 'not_submitted';
  })();

  const auditLogEvents = useMemo(() => {
    return buildAuditLog(serviceRecord, job, isOdhh);
  }, [serviceRecord, job, isOdhh]);

  // State jobs: the whole TerpDesk hours form is replaced by a pointer to the state portal.
  if (job.isStateJob === true) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Actual service time</h2>
        <div className="rounded-xl border border-[#CEEAD6] bg-[#E6F4EA]/80 p-5 text-[#137333]">
          <p className="text-[15px] font-semibold leading-relaxed">
            State Job: Timesheets for this assignment must be submitted directly through the ODHH portal.
          </p>
          <a
            href={buildOdhhPortalUrl((job as any).data?.intake?.odhhSrn)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center rounded-full bg-[#1B433C] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#14332D]"
          >
            Open ODHH Portal
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 ">
      <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Actual service time</h2>
      <p className="text-[14px] text-[var(--sage)] mb-6">Separate from the scheduled booking above. Submitting or approving hours never changes the booking, the calendar or anyone's reservation, and it does not calculate pay.</p>

      {isFormOpen ? (
        <div className="mb-4 relative">
          <button onClick={() => setIsFormOpen(false)} className="bg-[#1B433C] text-white rounded-full px-5 py-2 text-sm font-medium mb-6 transition-colors hover:bg-[#14332D]">Close</button>
          
          <div className="bg-[#F5F4F0] p-6 rounded-xl">
             {isFutureAppointment && (
               <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3.5 text-xs flex items-center gap-2 mb-6">
                 <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                 <span>Actual service time can be entered once the appointment starts.</span>
               </div>
             )}

             <p className="text-sm text-gray-600 mb-6">The scheduled times are filled in as a starting point. Nothing is recorded until you submit, and they are not treated as confirmed until you do. Changing these times does not move the booking in anyone's calendar.</p>
             
             <InterpreterSubmitForm
               isFutureAppointment={isFutureAppointment}
               isSubmitting={isSubmitting}
               isOdhh={isOdhh}
               timeZoneLabel={String((job as any).details?.timeZone || job.timeZone || "the appointment time zone")}
               odhhPortalUrl={buildOdhhPortalUrl((job as any).data?.intake?.odhhSrn)}
               actualStart={actualStart}
               actualEnd={actualEnd}
               onActualStartChange={(v) => {
                 setActualStart(v);
                 setFieldErrors({});
               }}
               onActualEndChange={(v) => {
                 setActualEnd(v);
                 setFieldErrors({});
               }}
               breakMinutes={breakMinutes}
               onBreakMinutesChange={setBreakMinutes}
               travelStart={travelStart}
               travelEnd={travelEnd}
               onTravelStartChange={(v) => {
                 setTravelStart(v);
                 setFieldErrors({});
               }}
               onTravelEndChange={(v) => {
                 setTravelEnd(v);
                 setFieldErrors({});
               }}
               serviceCompleted={serviceCompleted}
               onServiceCompletedChange={setServiceCompleted}
               cancellationReason={cancellationReason}
               onCancellationReasonChange={setCancellationReason}
               fieldErrors={fieldErrors}
               formError={submitError}
               serviceTimeHours={serviceTimeHours}
               mileageLegs={mileageLegs}
               totalMileage={totalMileage}
               onAddLeg={addMileageLeg}
               onRemoveLeg={removeMileageLeg}
               onUpdateLeg={updateMileageLeg}
               mileageNote={mileageNote}
               onMileageNoteChange={setMileageNote}
               note={note}
               onNoteChange={setNote}
               hasSignature={Boolean(signatureDataUrl)}
               onSignatureChange={setSignatureDataUrl}
               onSubmit={handleSubmit}
               onSaveDraft={handleSaveDraft}
             />
          </div>
        </div>
      ) : currentState === 'not_submitted' ? (
        <div>
          <div className="flex justify-between items-start mb-6">
             <div className="flex-1">
               <h3 className="font-medium text-[var(--ink)] mb-4">Your reported hours</h3>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm mb-6">
                 <div className="space-y-4">
                   <div>
                     <div className="text-[var(--sage)] mb-1">Scheduled booking</div>
                     <div className="text-[var(--ink)]">
                       {(() => {
                          const startStr = (job as any).details?.startDate ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}` : job.startsAt;
                          const endStr = (job as any).details?.endDate ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}` : job.endsAt;
                          const tz = (job as any).details?.timeZone || job.timeZone;
                          return startStr ? formatJobDate(startStr, endStr, tz) : job.dateString;
                       })()}
                     </div>
                   </div>
                   {isOdhh ? (
                     <>
                       <div>
                         <div className="text-[var(--sage)] mb-1">Travel time</div>
                         <div className="text-[var(--ink)]">Not reported yet</div>
                       </div>
                       <div>
                         <div className="text-[var(--sage)] mb-1">Service completion</div>
                         <div className="text-[var(--ink)]">Not reported yet</div>
                       </div>
                     </>
                   ) : (
                     <div>
                       <div className="text-[var(--sage)] mb-1">Unpaid break</div>
                       <div className="text-[var(--ink)]">None</div>
                     </div>
                   )}
                   <div>
                     <div className="text-[var(--sage)] mb-1">Mileage reported</div>
                     <div className="text-[var(--ink)]">0.0 mi</div>
                   </div>
                 </div>
                 
                 <div className="space-y-4">
                   <div>
                     <div className="text-[var(--sage)] mb-1">Reported actual time</div>
                     <div className="text-[var(--ink)]">Not reported yet</div>
                   </div>
                   <div>
                     <div className="text-[var(--sage)] mb-1">Service time</div>
                     <div className="text-[var(--ink)]">—</div>
                   </div>
                   <div>
                     <div className="text-[var(--sage)] mb-1">Mileage approved by the agency</div>
                     <div className="text-[var(--ink)]">Not approved yet</div>
                   </div>
                 </div>
               </div>
             </div>
             <span className="bg-[#F5F4F0] text-gray-600 px-3 py-1 rounded-full text-[12px] font-medium shrink-0 ml-4">Not submitted</span>
          </div>
          
          {isFutureAppointment ? (
            <div className="space-y-3">
              <button
                type="button"
                disabled
                className="bg-gray-200 text-gray-400 rounded-full px-5 py-2 text-sm font-medium cursor-not-allowed"
              >
                Submit actual hours
              </button>
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Actual service time can be entered once the appointment starts.</span>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setIsFormOpen(true)} className="bg-[#1B433C] text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-[#14332D] transition-colors">
              Submit actual hours
            </button>
          )}
        </div>
      ) : (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-4">
             <h3 className="font-medium text-[var(--ink)]">
               {currentState === 'approved' ? 'Hours Approved by Agency' :
                currentState === 'awaiting_review' ? 'Hours Submitted & Awaiting Agency Review' :
                currentState === 'correction_requested' ? 'Correction Requested by Agency' :
                'Hours Saved as Draft'}
             </h3>
             <span className={`px-3 py-1 text-[12px] font-medium rounded-full capitalize ${
               currentState === 'approved' ? 'bg-green-100 text-green-700' :
               currentState === 'awaiting_review' ? 'bg-purple-100 text-purple-700' :
               currentState === 'correction_requested' ? 'bg-orange-100 text-orange-700' :
               'bg-gray-100 text-gray-700'
             }`}>
               {currentState === 'approved' ? 'Approved' :
                currentState === 'awaiting_review' ? 'Awaiting review' :
                currentState === 'correction_requested' ? 'Correction requested' :
                'Draft'}
             </span>
          </div>

          {currentState === 'correction_requested' && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 mb-6">
              <div className="font-medium text-xs text-amber-800 uppercase tracking-wide mb-1">Message from Agency</div>
              <p className="text-sm">{serviceRecord?.reviewMessage || "The agency requested adjustments to your reported service hours."}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm mb-6">
            <div className="space-y-4">
              <div>
                <div className="text-[var(--sage)] mb-1">Scheduled booking</div>
                <div className="text-[var(--ink)]">
                  {(() => {
                     const startStr = (job as any).details?.startDate ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}` : job.startsAt;
                     const endStr = (job as any).details?.endDate ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}` : job.endsAt;
                     const tz = (job as any).details?.timeZone || job.timeZone;
                     return startStr ? formatJobDate(startStr, endStr, tz) : job.dateString;
                  })()}
                </div>
              </div>

              {isOdhh ? (
                <>
                  <div>
                    <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                      <span>Travel time</span>
                      {serviceRecord?.travelStart && (
                        <CopyButton
                          text={formatJobDate(serviceRecord.travelStart, serviceRecord.travelEnd, job.timeZone)}
                          label="travel time"
                        />
                      )}
                    </div>
                    <div className="text-[var(--ink)]">
                      {serviceRecord?.travelStart
                        ? formatJobDate(serviceRecord.travelStart, serviceRecord.travelEnd, job.timeZone)
                        : "None reported"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                      <span>Service completion</span>
                      {serviceRecord && (
                        <CopyButton
                          text={serviceRecord.serviceCompleted === 'no' || serviceRecord.serviceCompleted === false ? "No" : "Yes"}
                          label="service completion"
                        />
                      )}
                    </div>
                    <div className="text-[var(--ink)]">
                      {serviceRecord
                        ? (serviceRecord.serviceCompleted === 'no' || serviceRecord.serviceCompleted === false ? "Not completed (No)" : "Completed (Yes)")
                        : "Not reported yet"}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="text-[var(--sage)] mb-1">Unpaid break</div>
                  <div className="text-[var(--ink)]">{serviceRecord?.breakMinutes === 0 ? 'None' : `${serviceRecord?.breakMinutes ?? 0} min`}</div>
                </div>
              )}

              <div>
                <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                  <span>Mileage reported</span>
                  {serviceRecord && (
                    <CopyButton
                      text={`${(serviceRecord?.reportedMileage || 0).toFixed(1)} mi`}
                      label="mileage reported"
                    />
                  )}
                </div>
                <div className="text-[var(--ink)]">{(serviceRecord?.reportedMileage || 0).toFixed(1)} mi</div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                  <span>Reported actual time</span>
                  {serviceRecord?.actualStart && (
                    <CopyButton
                      text={formatJobDate(serviceRecord.actualStart, serviceRecord.actualEnd, job.timeZone)}
                      label="reported actual time"
                    />
                  )}
                </div>
                <div className="text-[var(--ink)]">{serviceRecord?.actualStart ? formatJobDate(serviceRecord.actualStart, serviceRecord.actualEnd, job.timeZone) : "Not reported yet"}</div>
              </div>
              <div>
                <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                  <span>Service time</span>
                  {serviceRecord && (
                    <CopyButton text={serviceTimeHours} label="service time" />
                  )}
                </div>
                <div className="text-[var(--ink)]">{serviceTimeHours}</div>
              </div>
              <div>
                <div className="text-[var(--sage)] mb-1">Mileage approved by the agency</div>
                <div className="text-[var(--ink)]">
                  {serviceRecord?.approvedMileage !== null && serviceRecord?.approvedMileage !== undefined
                    ? `${serviceRecord.approvedMileage.toFixed(1)} mi approved`
                    : "Not approved yet"}
                </div>
              </div>
            </div>
          </div>

          {(serviceRecord?.mileageNote || serviceRecord?.serviceNote) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6 border-t border-gray-100 pt-4">
              {serviceRecord.mileageNote && (
                <div>
                  <div className="text-[var(--sage)] text-xs mb-1 flex items-center justify-between">
                    <span>Mileage note</span>
                    <CopyButton text={serviceRecord.mileageNote} label="mileage note" />
                  </div>
                  <div className="text-[var(--ink)] text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    {serviceRecord.mileageNote}
                  </div>
                </div>
              )}
              {serviceRecord.serviceNote && (
                <div>
                  <div className="text-[var(--sage)] text-xs mb-1 flex items-center justify-between">
                    <span>Service note</span>
                    <CopyButton text={serviceRecord.serviceNote} label="service note" />
                  </div>
                  <div className="text-[var(--ink)] text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    {serviceRecord.serviceNote}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentState === 'awaiting_review' && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-purple-900 mb-6">
              <div className="font-semibold text-xs text-purple-800 uppercase tracking-wider mb-1">Hours locked for review</div>
              <p>Your actual service time has been submitted and is currently locked while awaiting review and confirmation by the agency. You cannot edit or submit changes while under review. If adjustments are required, the agency will request a correction.</p>
            </div>
          )}

          {currentState === 'approved' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-900 mb-6">
              <div className="font-semibold text-xs text-green-800 uppercase tracking-wider mb-1">Service record finalized & approved</div>
              <p>Approved · v{serviceRecord?.version || 1}. The reported service hours have been verified and approved by the agency. This record is permanently closed and locked. Approval confirms the service record only; it is not a payment.</p>
            </div>
          )}
          
          <div className="mb-6">
            <button 
              type="button"
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors mb-2 focus:outline-none"
            >
               {isHistoryOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />} Version history ({serviceRecord?.version || 1})
            </button>
            {isHistoryOpen && (
              <div className="mt-3">
                <VersionHistoryAuditLog 
                  events={auditLogEvents} 
                  timeZone={(job as any).details?.timeZone || job.timeZone} 
                />
              </div>
            )}
          </div>
          
          {currentState === 'draft' && (
            isFutureAppointment ? (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled
                  className="bg-gray-200 text-gray-400 rounded-full px-5 py-2 text-sm font-medium cursor-not-allowed"
                >
                  Edit draft / Submit actual hours
                </button>
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Actual service time can be entered once the appointment starts.</span>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => setIsFormOpen(true)} className="bg-[#1B433C] text-white hover:bg-[#14332D] rounded-full px-5 py-2 text-sm font-medium transition-colors">
                Edit draft / Submit actual hours
              </button>
            )
          )}
          {currentState === 'correction_requested' && (
            isFutureAppointment ? (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled
                  className="bg-gray-200 text-gray-400 rounded-full px-5 py-2 text-sm font-medium cursor-not-allowed"
                >
                  Submit a correction
                </button>
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Actual service time can be entered once the appointment starts.</span>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => setIsFormOpen(true)} className="bg-[#1B433C] text-white hover:bg-[#14332D] rounded-full px-5 py-2 text-sm font-medium transition-colors">
                Submit a correction
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}


export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { jobs, acceptJobOffer, declineOffer, markJobReleased } = useInterpreterJobs();
  const [isOffersOpen, setIsOffersOpen] = useState(false);
  const [showGiveBackModal, setShowGiveBackModal] = useState(false);
  const [giveBackReason, setGiveBackReason] = useState("");
  const [isPending, startTransition] = React.useTransition();
  const [actingAction, setActingAction] = useState<'accept' | 'decline' | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleAccept = () => {
    setActionError(null);
    setActingAction('accept');
    startTransition(async () => {
      try {
        await acceptJobOffer(job!.id);
      } catch (err: any) {
        console.error(err);
        setActionError(err?.message || "This offer has expired because the scheduled appointment time has already ended.");
      } finally {
        setActingAction(null);
      }
    });
  };

  const handleDecline = () => {
    setActionError(null);
    setActingAction('decline');
    startTransition(async () => {
      try {
        await declineOffer(id);
      } catch (err: any) {
        console.error(err);
        setActionError(err?.message || "Failed to decline offer.");
      } finally {
        setActingAction(null);
      }
    });
  };

  const handleGiveBack = () => {
    if (!isEntirelyFuture) {
      alert("Assignments cannot be given back once the appointment has started or passed.");
      setShowGiveBackModal(false);
      return;
    }
    setActingAction('decline'); // Reuse 'decline' or create a new 'giveBack' state, but 'decline' disables buttons which is good
    startTransition(async () => {
      if (job) {
        const result = await giveBackAssignment(job.id, job.requestId, giveBackReason);
        setActingAction(null);
        if (!result.success) {
          alert(result.error);
          return;
        }
        setShowGiveBackModal(false);
        markJobReleased(job.id);
        router.refresh();
        router.push('/jobs');
      }
    });
  };

  const job = jobs.find(j => j.id === id);

  if (!job) return <div className="p-8 text-center text-[var(--sage)]">Job not found</div>;

  const isOdhh = job.program === 'wa_odhh' || job.program === 'WA ODHH' || (job as any).data?.intake?.program === 'WA ODHH' || (job as any).data?.intake?.program === 'wa_odhh';
  const programLabel = isOdhh ? 'WA ODHH (State Agency)' : 'Private Hospital / Standard Agency';

  const { startsAt: resolvedStartsAt, endsAt: resolvedEndsAt } = resolveRequestTimes(job);
  const startsAtDate = new Date(resolvedStartsAt);
  const endsAtDate = new Date(resolvedEndsAt);
  const now = new Date(currentTime);

  // Strict condition: only show "Give back this assignment" if new Date() < startsAt (appointment is entirely in the future)
  const isEntirelyFuture = !isNaN(startsAtDate.getTime()) && (new Date() < startsAtDate) && (now < startsAtDate);
  const isJobPassed = !isNaN(endsAtDate.getTime()) ? now > endsAtDate : false;
  const isJobExpired = job.status === 'expired' || (job.status === 'pending' && isJobPassed);

  if (job.status === 'declined') {
    return (
      <div className="max-w-[1200px] mx-auto p-4 md:p-8 w-full pb-24 antialiased flex flex-col items-center justify-center pt-32">
        <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-8 text-center max-w-md w-full">
          <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">Offer Declined</h2>
          <p className="text-[var(--sage)] mb-8">You have declined this offer.</p>
          <Link href="/interpreter-home" className="inline-flex items-center justify-center gap-2 text-[14px] font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-6 py-2.5 rounded-full transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (job.status === 'released') {
    return (
      <div className="max-w-[1200px] mx-auto p-4 md:p-8 w-full pb-24 antialiased flex flex-col items-center justify-center pt-32">
        <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-8 text-center max-w-md w-full">
          <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">Assignment Released</h2>
          <p className="text-[var(--sage)] mb-8">You have released this assignment and no longer have access.</p>
          <Link href="/interpreter-home" className="inline-flex items-center justify-center gap-2 text-[14px] font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-6 py-2.5 rounded-full transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto p-4 md:p-8 w-full pb-24 antialiased">
      
      {/* Back Button */}
      <div className="mb-6">
        <Link href="/jobs" className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--sage)] hover:text-[var(--ink)] transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to assignments
        </Link>
      </div>

      <div className="max-w-[800px]">
        {/* Page Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="mb-3">
              {isOdhh ? (
                <span className="bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                  ODHH State Agency
                </span>
              ) : (
                <span className="bg-gray-100 text-gray-600 border border-gray-200 text-xs font-medium px-3 py-1 rounded-full uppercase tracking-wide">
                  Private Hospital
                </span>
              )}
            </div>
            <h1 className="text-[28px] font-semibold text-[var(--ink)] mb-1 tracking-tight">
              {job.title}
            </h1>
            <p className="text-[15px] text-[var(--sage)]">
              {(() => {
                 const startStr = job.startsAt || ((job as any).details?.startDate ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}` : undefined);
                 const endStr = job.endsAt || ((job as any).details?.endDate ? `${(job as any).details.endDate}T${(job as any).details.endTime || '00:00'}` : undefined);
                 const tz = (job as any).details?.timeZone || job.timeZone;
                 return startStr ? formatDetailsDate(startStr, endStr, tz) : job.dateString;
              })()}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 sm:mt-2">
            {isAppointmentHappeningNow(job, currentTime) && (
              <HappeningNowBadge />
            )}
            {isJobExpired ? (
              <span className="bg-amber-100 text-amber-900 border border-amber-300 text-sm px-3 py-1 rounded-full font-semibold">
                Offer expired
              </span>
            ) : job.status === 'pending' ? (
              <span className="bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-full font-medium">
                Offers / draft
              </span>
            ) : null}
            {job.status === 'booked' && (
              <span className="bg-[#E2EBE5] text-[#1B433C] text-[12px] px-3 py-1.5 rounded-full font-medium">
                Booked
              </span>
            )}
            {job.status === 'booked' && <UpdatedBadge update={job.detailsUpdated} endsAt={job.endsAt} className="h-7 text-[12px]" />}
            <Link href="/interpreter-calendar" className="bg-white border border-gray-200 text-[var(--ink)] text-sm px-4 py-1.5 rounded-full hover:bg-gray-50 transition-colors ">
              View in calendar
            </Link>
          </div>
        </div>

        {job.status === 'booked' && <UpdatedNotice update={job.detailsUpdated} endsAt={job.endsAt} />}

        <div className="space-y-4">
          {/* Agency messages + "Request clarification" (parity with the secure job-details page). */}
          {job.status === 'booked' && (
            <JobQuestionsAndMessages offerId={job.id} timeZone={(job as any).details?.timeZone || job.timeZone} />
          )}
          
          {/* Overview Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 ">
            <h2 className="text-[16px] font-semibold text-[var(--ink)] mb-4">Overview</h2>
            <div className="space-y-0">
              <div className="flex items-center justify-between py-3 border-b border-gray-50">
                <span className="text-[14px] text-gray-400">Request source</span>
                <span className="text-[14px] font-medium text-[var(--ink)] text-right">{programLabel}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-50">
                <span className="text-[14px] text-gray-400">Location</span>
                <span className="text-[14px] text-[var(--ink)] text-right">{job.location}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-50">
                <span className="text-[14px] text-gray-400">Reference</span>
                <span className="text-[14px] font-medium text-[var(--ink)]">{formatReference(job.requestId || job.id)}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-[14px] text-gray-400">Status</span>
                <span className="text-[14px] text-[var(--ink)]">See your offer status below</span>
              </div>
            </div>

            {/* Human-readable Program Type Description Callout */}
            <div className={`mt-5 rounded-xl p-4 text-xs flex items-start gap-3 ${
              isOdhh 
                ? 'bg-[#E6F4EA]/80 border border-[#CEEAD6] text-[#137333]' 
                : 'bg-[#F9F8F6] border border-[#EBE8DF] text-gray-700'
            }`}>
              <Building2 className="w-4 h-4 shrink-0 mt-0.5 opacity-80" />
              <div className="leading-relaxed">
                <span className="font-semibold block mb-0.5 text-[13px]">
                  {isOdhh ? 'State Agency Assignment · WA ODHH' : 'Healthcare Assignment · Private Hospital / Standard'}
                </span>
                <p className="text-[13px] opacity-90">
                  {isOdhh
                    ? 'This assignment is requested through the Washington Office of the Deaf and Hard of Hearing (WA ODHH). State guidelines, authorized travel time tracking, and specific verification rules apply.'
                    : 'This assignment is requested through a private hospital / standard healthcare facility. Standard billing rates and direct facility procedures apply.'}
                </p>
              </div>
            </div>
          </div>

          {/* Assignment Details Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 ">
            <h2 className="text-[16px] font-semibold text-[var(--ink)] mb-4">Assignment details</h2>
            <div className="space-y-0">
              <div className="flex items-center justify-between py-3 border-b border-gray-50">
                <span className="text-[14px] text-gray-400">Program type</span>
                <span className="text-[14px] font-medium text-[var(--ink)]">{programLabel}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-50">
                <span className="text-[14px] text-gray-400">Format</span>
                <span className="text-[14px] text-[var(--ink)]">
                  {job.isVirtual ? 'Virtual' : 'In person'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-[14px] text-gray-400">Time zone</span>
                <span className="text-[14px] text-[var(--ink)]">
                  {(job as any).details?.timeZone || job.timeZone || 'Pacific Time — Seattle, Los Angeles'}
                </span>
              </div>
            </div>
          </div>

          {/* Location & Virtual Meeting Details Card */}
          {job.isVirtual ? (() => {
            const meetingLink = job.meetingLink || (job as any).details?.meetingLink || (job as any).virtualLink || (job as any).details?.virtualLink;
            const meetingId = job.meetingId || (job as any).details?.meetingId;
            const passcode = job.passcode || (job as any).details?.passcode || (job as any).accessCode || (job as any).details?.accessCode;
            const platform = job.platform || (job as any).details?.platform || (meetingLink?.toLowerCase().includes('zoom') ? 'Zoom' : meetingLink?.toLowerCase().includes('teams') ? 'Microsoft Teams' : meetingLink?.toLowerCase().includes('meet.google') ? 'Google Meet' : 'Virtual meeting');
            const virtualNotes = (job as any).virtualInstructions || (job as any).details?.virtualInstructions || (job as any).details?.instructions;
            const isOffer = job.status === 'pending';
            const hasCredentials = Boolean(meetingLink || meetingId || passcode);

            return (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                  <div>
                    <h2 className="text-[16px] font-semibold text-[var(--ink)]">Virtual meeting details</h2>
                    <p className="text-xs text-[var(--sage)] mt-0.5">Platform: <span className="font-medium text-gray-700">{platform}</span></p>
                  </div>
                  {meetingLink && !isOffer && (
                    <a
                      href={meetingLink.startsWith('http') ? meetingLink : `https://${meetingLink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1B433C] text-white text-xs font-semibold hover:bg-[#14332D] transition-colors shadow-sm self-start sm:self-auto"
                    >
                      Open meeting link <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {isOffer && hasCredentials ? (
                  <div className="space-y-3">
                    <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
                      <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold text-amber-900">Virtual credentials locked</p>
                        <p className="text-amber-800 leading-relaxed">Exact meeting join URL, passcode, and room credentials are masked until you accept this offer. Accept the offer below to unlock immediate access.</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--sage)] text-xs">Meeting link:</span>
                        <span className="font-mono text-gray-400 text-xs">https://••••••••••••/j/••••••••</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--sage)] text-xs">Passcode / Access code:</span>
                        <span className="font-mono text-gray-400 text-xs">••••••••</span>
                      </div>
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

                    {virtualNotes && (
                      <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 text-xs text-gray-700">
                        <span className="font-semibold block text-[11px] text-[var(--sage)] uppercase tracking-wider mb-1">Virtual Instructions</span>
                        <p className="leading-relaxed whitespace-pre-line">{virtualNotes}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/80 text-sm">
                    <p className="text-[var(--ink)] font-medium mb-1">Virtual details pending</p>
                    <p className="text-[var(--sage)] text-xs">Meeting join link and credentials will be posted by the agency prior to appointment start.</p>
                  </div>
                )}

                <p className="text-[12px] text-[var(--sage)] pt-1">
                  Treat meeting links and access codes as restricted assignment information.
                </p>
              </div>
            );
          })() : (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h2 className="text-[16px] font-semibold text-[var(--ink)] mb-2">On-site location details</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                  <div>
                    <span className="block text-[11px] font-semibold text-[var(--sage)] uppercase tracking-wider mb-0.5">Venue / Address</span>
                    <span className="text-xs font-medium text-[var(--ink)]">
                      {(job.onsite?.venue || job.location) + (job.onsite?.address ? ` · ${job.onsite.address}` : '')}
                    </span>
                  </div>
                  {(job.onsite?.address || job.location) && (
                    <CopyButton text={`${job.onsite?.venue || ''} ${job.onsite?.address || job.location}`.trim()} label="address" />
                  )}
                </div>
                {job.onsite?.building && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-50 text-xs">
                    <span className="text-[var(--sage)]">Building / Room</span>
                    <span className="font-medium text-[var(--ink)]">{job.onsite.building}</span>
                  </div>
                )}
                {job.onsite?.contact && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-50 text-xs">
                    <span className="text-[var(--sage)]">Onsite Contact</span>
                    <span className="font-medium text-[var(--ink)]">
                      {job.onsite.contact} {job.onsite.contactMethod ? `(${job.onsite.contactMethod})` : ''}
                    </span>
                  </div>
                )}
                {job.onsite?.parking && (
                  <div className="py-2 border-b border-gray-50 text-xs">
                    <span className="text-[var(--sage)] block mb-1">Parking Instructions</span>
                    <span className="text-[var(--ink)]">{job.onsite.parking}</span>
                  </div>
                )}
                {job.onsite?.entrance && (
                  <div className="py-2 text-xs">
                    <span className="text-[var(--sage)] block mb-1">Entrance & Check-in</span>
                    <span className="text-[var(--ink)]">{job.onsite.entrance}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Card 2 */}
          <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 ">
            <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Preparation notes</h2>
            <p className="text-[14px] text-[var(--sage)]">No preparation notes yet.</p>
          </div>

          {/* Card 3 */}
          <JobPrepMaterials
            requestId={job.requestId}
            cardClass="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 "
          />

          {/* Actual Service Time Component */}
          <ServiceTimeBlock job={job} />

          {/* Card 4 - Staffing */}
          <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 ">
            <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Staffing</h2>
            <p className="text-[14px] text-[var(--sage)] mb-8">Pending offers do not reserve time.</p>

            <h3 className="text-[16px] font-semibold text-[var(--ink)] mb-4">
              {job.positionIndex ? `Position ${job.positionIndex} · interpreter` : "Your position · interpreter"}
            </h3>

            <div className="flex flex-wrap items-center gap-3 mb-6">
              {isJobExpired ? (
                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[12px] font-medium px-3 py-1 rounded-full">
                  Booking: Offer expired
                </span>
              ) : job.status === 'pending' ? (
                <span className="bg-[#FEF3C7] text-[#92400E] text-[12px] font-medium px-3 py-1 rounded-full">
                  Booking: Unfilled
                </span>
              ) : (
                <span className="bg-[#E2EBE5] text-[#1B433C] text-[12px] font-medium px-3 py-1 rounded-full">
                  Booking: Reserved
                </span>
              )}
              <span className="bg-white border border-gray-200 text-gray-600 text-[12px] font-medium px-3 py-1 rounded-full ">
                Access: Available
              </span>
            </div>

            <p className="text-[14px] text-gray-700 mb-6">
              Assigned interpreter: <span className="text-[var(--sage)]">
                {job.status === 'pending' || isJobExpired ? 'Unfilled' : 'You'}
              </span>
            </p>

            {actionError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3.5 text-xs flex items-center justify-between gap-2 mb-4">
                <span>{actionError}</span>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="text-red-600 hover:text-red-800 p-1"
                >
                  ✕
                </button>
              </div>
            )}

            {isJobExpired ? (
              <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-5 md:p-6 mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[14px] font-medium text-amber-950">Your offer ·</span>
                  <span className="bg-amber-200 text-amber-900 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-amber-300">
                    Expired
                  </span>
                </div>
                <p className="text-[13px] text-amber-900 leading-relaxed">
                  This offer expired because the appointment ended on {formatJobDate(job.startsAt, job.endsAt, (job as any).details?.timeZone || job.timeZone)} before a response was submitted. It has been removed from active offers and can no longer be accepted.
                </p>
              </div>
            ) : job.status === 'pending' ? (
              <div className="bg-[var(--canvas)] border border-gray-200 rounded-xl p-5 md:p-6 mt-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-[var(--ink)]">Your offer ·</span>
                      <span className="bg-[#E0E7FF] text-[#4338CA] text-[11px] font-semibold px-2 py-0.5 rounded-full">
                        Pending
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--sage)]">
                      Response due {(() => {
                         const startStr = (job as any).details?.startDate ? `${(job as any).details.startDate}T${(job as any).details.startTime || '00:00'}` : job.startsAt;
                         const tz = (job as any).details?.timeZone || job.timeZone;
                         return startStr ? formatJobDate(startStr, undefined, tz) : 'soon';
                      })()}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button 
                      onClick={handleAccept}
                      disabled={isPending && actingAction === 'accept'}
                      className="bg-[var(--forest)] hover:bg-[#145347] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-white text-[13px] font-medium px-5 py-2 rounded-full transition-colors w-full sm:w-auto flex justify-center items-center gap-2"
                    >
                      {isPending && actingAction === 'accept' ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          Accepting...
                        </>
                      ) : 'Accept offer'}
                    </button>
                    <button 
                      onClick={handleDecline}
                      disabled={isPending && actingAction === 'decline'}
                      className="bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-gray-800 border border-gray-200 text-[13px] font-medium px-5 py-2 rounded-full transition-colors w-full sm:w-auto flex justify-center items-center gap-2"
                    >
                      {isPending && actingAction === 'decline' ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-gray-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          Declining...
                        </>
                      ) : 'Decline offer'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                <div className="bg-[#F5F4F0] rounded-xl p-4">
                  <button 
                    type="button"
                    onClick={() => setIsOffersOpen(!isOffersOpen)}
                    className="w-full flex items-center justify-between text-left focus:outline-none cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        className={`w-4 h-4 text-gray-700 transition-transform duration-200 ${
                          isOffersOpen ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                      <span className="font-medium text-sm text-[var(--ink)]">Previous offers (1)</span>
                    </div>
                    <span className="text-xs text-[var(--sage)] font-normal group-hover:text-gray-700 transition-colors">
                      {isOffersOpen ? "Hide" : "Show"}
                    </span>
                  </button>
                  
                  {isOffersOpen && (
                    <div className="mt-3.5 flex items-center gap-2 pl-6 pt-3 border-t border-gray-200/60">
                      <span className="text-[14px] text-gray-600">Your offer ·</span>
                      <span className="bg-white border border-gray-200 text-gray-600 text-[11px] font-medium px-2 py-0.5 rounded-full ">
                        Closed
                      </span>
                    </div>
                  )}
                </div>

                {isEntirelyFuture && (
                  <div className="flex justify-start gap-3 flex-wrap mt-2">
                    <button 
                      type="button"
                      onClick={() => setShowGiveBackModal(true)}
                      className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-[13px] font-medium px-5 py-2 rounded-full transition-colors cursor-pointer"
                    >
                      Give back this assignment
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

        </div>
      </div>
      
      {showGiveBackModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-[22px] font-semibold text-gray-900">Give back this assignment</h3>
              <button onClick={() => setShowGiveBackModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <p className="text-[15px] leading-relaxed text-gray-600 mb-6">
              This releases your position and tells the agency it needs a replacement. It does not cancel the appointment, and any other interpreter on this job keeps their booking. You will lose access to the job details, prep materials and any meeting link. A short record stays in your history.
            </p>
            
            <div className="mb-8">
              <label className="block text-[13px] text-gray-500 mb-2">Reason for the agency</label>
              <input 
                type="text" 
                value={giveBackReason}
                onChange={(e) => setGiveBackReason(e.target.value)}
                className="w-full bg-[#F5F4F0] border border-[#EBE8DF] rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#0B3B32]/30"
              />
            </div>
            
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button 
                onClick={() => setShowGiveBackModal(false)}
                className="px-6 py-2.5 rounded-full border border-gray-200 text-[15px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Keep this assignment
              </button>
              <button 
                onClick={handleGiveBack}
                disabled={giveBackReason.trim() === "" || isPending}
                className={`px-6 py-2.5 rounded-full text-white text-[15px] font-medium transition-colors ${giveBackReason.trim() === "" || isPending ? 'bg-[#D49F96] opacity-50 cursor-not-allowed' : 'bg-[#C94A38] hover:bg-[#B03C2C]'}`}
              >
                {isPending ? 'Releasing...' : 'Give back this assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
