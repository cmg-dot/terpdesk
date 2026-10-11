"use client";

import React, { useState, useEffect, useTransition, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, MapPin, Copy, Check, Building2 } from "lucide-react";
import { useInterpreterJobs } from "@/context/InterpreterJobsContext";
import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { giveBackAssignment } from "@/app/actions/giveBackAssignment";
import { submitInterpreterHours } from "@/app/actions/submitInterpreterHours";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { formatReference } from "@/utils/statusEngine";

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
  const isApproved = serviceRecord.state === 'approved' || ['approved', 'completed', 'billed'].includes(job?.requestStatus);
  const isCorrectionReq = serviceRecord.state === 'changes_requested' || serviceRecord.state === 'correction_requested' || job?.requestStatus === 'correction_requested';
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

  const [timeChecked, setTimeChecked] = useState(false);
  const [mileageChecked, setMileageChecked] = useState(false);
  const [signatureChecked, setSignatureChecked] = useState(false);

  const isOdhh = job.program === 'wa_odhh' || job.program === 'WA ODHH' || (job as any).data?.intake?.program === 'WA ODHH' || (job as any).data?.intake?.program === 'wa_odhh';
  const [travelStart, setTravelStart] = useState(() => toLocalInput(job.startsAt));
  const [travelEnd, setTravelEnd] = useState(() => toLocalInput(job.endsAt));
  const [serviceCompleted, setServiceCompleted] = useState<string>("yes");
  const [completionChecked, setCompletionChecked] = useState(false);

  useEffect(() => {
    const loadRecord = () => {
      let found: any = null;
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('terpdesk_service_records');
        if (stored) {
          try {
            const records = JSON.parse(stored);
            found = records.find((r: any) => r.appointmentId === job.id || r.appointmentId === job.requestId);
          } catch (e) {
            console.error(e);
          }
        }
      }
      if (!found && ((job as any).hoursSubmission || (job as any).travelStartTime || ['awaiting_review', 'correction_requested', 'approved'].includes(job.requestStatus))) {
        const hs = (job as any).hoursSubmission || {};
        found = {
          id: (job as any).requestId || job.id,
          appointmentId: (job as any).requestId || job.id,
          interpreterName: "Jamie Fictional",
          state: job.requestStatus === 'approved' ? 'approved' : job.requestStatus === 'correction_requested' ? 'correction_requested' : 'awaiting_review',
          scheduledStart: job.startsAt,
          scheduledEnd: job.endsAt,
          actualStart: hs.actualStartTime || job.startsAt,
          actualEnd: hs.actualEndTime || job.endsAt,
          breakMinutes: hs.breakMinutes || 0,
          reportedMileage: hs.miles || 0,
          mileageNote: hs.mileageNote || "",
          serviceNote: hs.note || "",
          travelStart: (job as any).travelStartTime || hs.travelStartTime || job.startsAt,
          travelEnd: (job as any).travelEndTime || hs.travelEndTime || job.endsAt,
          serviceCompleted: (job as any).serviceCompleted ?? hs.serviceCompleted ?? "yes",
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
        if (found.serviceNote) setNote(found.serviceNote);
      }
    };
    loadRecord();
    window.addEventListener('storage', loadRecord);
    return () => window.removeEventListener('storage', loadRecord);
  }, [job.id, job.requestId, job.requestStatus]);

  if (job.status !== 'booked') return null;

  // TODO: Restore date lock after demo.
  // const isPastEndTime = job.endsAt ? Date.now() > new Date(job.endsAt).getTime() : false;
  const isPastEndTime = true;

  const totalMileage = mileageLegs.reduce((acc, leg) => {
    const dist = parseFloat(leg.distance as string) || 0;
    const multiplier = leg.type === 'round_trip' ? 2 : 1;
    return acc + (dist * multiplier);
  }, 0);

  const handleSaveDraft = () => {
    const draftRecord = {
      id: serviceRecord?.id || Math.random().toString(36).substring(7),
      appointmentId: job.requestId || job.id,
      interpreterName: "Jamie Fictional",
      state: 'draft',
      scheduledStart: job.startsAt,
      scheduledEnd: job.endsAt,
      actualStart: actualStart || job.startsAt,
      actualEnd: actualEnd || job.endsAt,
      breakMinutes: parseInt(breakMinutes) || 0,
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
      const idx = records.findIndex((r: any) => r.appointmentId === (job.requestId || job.id) || r.appointmentId === job.id);
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
    const isCorrection = serviceRecord?.state === 'approved' || serviceRecord?.state === 'changes_requested' || serviceRecord?.state === 'correction_requested' || job.requestStatus === 'correction_requested';
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
        breakMinutes: parseInt(breakMinutes) || 0,
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
      interpreterName: "Jamie Fictional",
      state: 'awaiting_review',
      scheduledStart: job.startsAt,
      scheduledEnd: job.endsAt,
      actualStart: actualStart || job.startsAt,
      actualEnd: actualEnd || job.endsAt,
      breakMinutes: parseInt(breakMinutes) || 0,
      reportedMileage: totalMileage,
      mileageNote: mileageNote,
      serviceNote: note,
      travelStart: travelStart || job.startsAt,
      travelEnd: travelEnd || job.endsAt,
      serviceCompleted: serviceCompleted,
      isOdhh: isOdhh,
      approvedMileage: null,
      reviewMessage: null,
      version: nextVersion,
      submittedAt: new Date().toISOString(),
      history: updatedHistory
    };

    job.requestStatus = 'awaiting_review';
    if ((job as any).hoursSubmission) {
      (job as any).hoursSubmission.reviewMessage = null;
      (job as any).hoursSubmission.approvedMileage = null;
      (job as any).hoursSubmission.version = nextVersion;
      (job as any).hoursSubmission.history = updatedHistory;
    }

    startSubmit(async () => {
      await submitInterpreterHours(job.requestId || job.id, startIso, endIso, totalMileage, {
        breakMinutes: parseInt(breakMinutes) || 0,
        travelStartTime: travelStartIso,
        travelEndTime: travelEndIso,
        serviceCompleted: isOdhh ? serviceCompleted : null,
        mileageNote: mileageNote,
        note: note,
        version: nextVersion,
        history: updatedHistory,
      });

      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('terpdesk_service_records');
        const records = stored ? JSON.parse(stored) : [];
        const idx = records.findIndex((r: any) => r.appointmentId === (job.requestId || job.id) || r.appointmentId === job.id);
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
      const mins = Math.max(0, (diffMs / 60000) - (parseInt(breakMinutes) || 0));
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

    if (job.requestStatus === 'awaiting_review') {
      return 'awaiting_review';
    }
    if (job.requestStatus === 'approved' || ['completed', 'billed'].includes(job.requestStatus)) {
      return 'approved';
    }
    if (job.requestStatus === 'correction_requested') {
      return 'correction_requested';
    }

    return 'not_submitted';
  })();

  const auditLogEvents = useMemo(() => {
    return buildAuditLog(serviceRecord, job, isOdhh);
  }, [serviceRecord, job, isOdhh]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 ">
      <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Actual service time</h2>
      <p className="text-[14px] text-[var(--sage)] mb-6">Separate from the scheduled booking above. Submitting or approving hours never changes the booking, the calendar or anyone's reservation, and it does not calculate pay.</p>

      {isFormOpen ? (
        <div className="mb-4 relative">
          <button onClick={() => setIsFormOpen(false)} className="bg-[#1B433C] text-white rounded-full px-5 py-2 text-sm font-medium mb-6 transition-colors hover:bg-[#14332D]">Close</button>
          
          <div className="bg-[#F5F4F0] p-6 rounded-xl">
             <p className="text-sm text-gray-600 mb-6">The scheduled times are filled in as a starting point. Nothing is recorded until you submit, and they are not treated as confirmed until you do. Changing these times does not move the booking in anyone's calendar.</p>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-[13px] text-gray-600 mb-2">Actual start</label>
                  <input type="datetime-local" value={actualStart} onChange={e => setActualStart(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32]" />
                  <p className="text-[11px] text-gray-500 mt-1">9:21 AM PDT - Pacific Time — Seattle, Los Angeles (UTC-07:00)</p>
                </div>
                <div>
                  <label className="block text-[13px] text-gray-600 mb-2">Actual end</label>
                  <input type="datetime-local" value={actualEnd} onChange={e => setActualEnd(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32]" />
                  <p className="text-[11px] text-gray-500 mt-1">12:21 PM PDT - Pacific Time — Seattle, Los Angeles (UTC-07:00)</p>
                </div>
             </div>
             
             {!isOdhh ? (
               <div className="mb-6">
                  <label className="block text-[13px] text-gray-600 mb-2">Unpaid break, in minutes (leave at 0 if none)</label>
                  <input type="number" value={breakMinutes} onChange={e => setBreakMinutes(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32]" />
               </div>
             ) : (
               <>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label className="block text-[13px] text-gray-600 mb-2">Travel start</label>
                      <input type="datetime-local" value={travelStart} onChange={e => setTravelStart(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32]" />
                    </div>
                    <div>
                      <label className="block text-[13px] text-gray-600 mb-2">Travel end</label>
                      <input type="datetime-local" value={travelEnd} onChange={e => setTravelEnd(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32]" />
                    </div>
                 </div>
                 
                 <div className="bg-white p-5 rounded-xl border border-gray-200 mb-6">
                    <h4 className="text-sm font-medium text-[var(--ink)] mb-2">Verification</h4>
                    <p className="text-xs text-[var(--sage)] mb-4">Was this service completed?</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="radio" value="yes" checked={serviceCompleted === "yes"} onChange={(e) => setServiceCompleted(e.target.value)} className="text-[var(--forest)] focus:ring-[#0B3B32]" />
                        Yes
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="radio" value="no" checked={serviceCompleted === "no"} onChange={(e) => setServiceCompleted(e.target.value)} className="text-[var(--forest)] focus:ring-[#0B3B32]" />
                        No
                      </label>
                    </div>
                 </div>
               </>
             )}
             
             <div className="mb-6">
                <p className="text-sm font-medium text-gray-800 mb-2">Service time before review: <span className="font-bold">{serviceTimeHours}</span></p>
             </div>
             
             <div className="bg-white p-5 rounded-xl border border-gray-200 mb-6">
                <h4 className="text-sm font-medium text-[var(--ink)] mb-2">Mileage for this assignment</h4>
                <p className="text-xs text-[var(--sage)] mb-6">Enter either the one-way distance and add a return on the same route, or enter the total distance already travelled without adding a return. This records miles only — no reimbursement is calculated here, and not every assignment pays mileage.</p>
                
                {mileageLegs.map(leg => {
                  const dist = parseFloat(leg.distance as string) || 0;
                  const legTotal = leg.type === 'round_trip' ? dist * 2 : dist;
                  return (
                    <div key={leg.id} className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
                      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3">
                        <input type="text" placeholder="From" value={leg.from} onChange={e => updateMileageLeg(leg.id, 'from', e.target.value)} className="w-full md:w-auto md:flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32]" />
                        <input type="text" placeholder="To" value={leg.to} onChange={e => updateMileageLeg(leg.id, 'to', e.target.value)} className="w-full md:w-auto md:flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32]" />
                        <input type="number" placeholder="Distance" value={leg.distance} onChange={e => updateMileageLeg(leg.id, 'distance', e.target.value)} className="w-full md:w-24 md:flex-none min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32]" />
                        <select value={leg.type} onChange={e => updateMileageLeg(leg.id, 'type', e.target.value)} className="w-full md:w-auto md:flex-[1.5] min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32] truncate text-ellipsis">
                          <option value="total">Total distance already travelled</option>
                          <option value="round_trip">One-way distance + return on same route</option>
                        </select>
                        <button onClick={() => removeMileageLeg(leg.id)} className="text-sm font-medium text-gray-500 hover:text-red-600 self-end md:self-auto shrink-0 transition-colors px-1">Remove</button>
                      </div>
                      <p className="text-xs text-gray-600">Calculated total for this leg: <span className="font-semibold">{legTotal.toFixed(1)} mi</span> {legTotal === 0 ? '— no distance added' : ''}</p>
                    </div>
                  );
                })}
                
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
                   <button onClick={addMileageLeg} className="bg-white border border-gray-300 text-gray-700 rounded-full px-4 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors">Add a travel leg</button>
                   <span className="text-sm text-gray-700">Calculated total mileage: <span className="font-bold">{totalMileage.toFixed(1)} mi</span></span>
                </div>

                <div className="mb-4">
                  <label className="block text-[13px] text-gray-600 mb-2">Mileage note (optional)</label>
                  <textarea rows={2} value={mileageNote} onChange={e => setMileageNote(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32]"></textarea>
                </div>

                <p className="text-xs text-[var(--sage)]">Automatic driving distance is not switched on. No mapping service is connected to this workspace yet, so nothing can be calculated from an address today.</p>
             </div>
             
             <div className="mb-6">
                <label className="block text-[13px] text-gray-600 mb-2">Service note (optional)</label>
                <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B32]"></textarea>
                <p className="text-xs text-[var(--sage)] mt-2">Keep this about timing only — start, end, breaks and waiting. Do not enter participant names, health details or anything said during the assignment.</p>
             </div>
             
             <div className="bg-white p-5 rounded-xl border border-gray-200 mb-6">
                <h4 className="text-sm font-medium text-[var(--ink)] mb-3">Before you submit</h4>
                <div className="space-y-2">
                   <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={timeChecked} onChange={e => setTimeChecked(e.target.checked)} className="rounded text-[var(--forest)] w-4 h-4 focus:ring-[#0B3B32]" />
                      <span className="text-sm text-gray-700">Actual service time — {serviceTimeHours}</span>
                   </label>
                   <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={mileageChecked} onChange={e => setMileageChecked(e.target.checked)} className="rounded text-[var(--forest)] w-4 h-4 focus:ring-[#0B3B32]" />
                      <span className="text-sm text-gray-700">Mileage — {totalMileage.toFixed(1)} mi reported (leave this empty if there was no travel to report)</span>
                   </label>
                   <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={signatureChecked} onChange={e => setSignatureChecked(e.target.checked)} className="rounded text-[var(--forest)] w-4 h-4 focus:ring-[#0B3B32]" />
                      <span className="text-sm text-gray-700">No verification signature is asked for on this assignment</span>
                   </label>
                   {isOdhh && (
                     <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={completionChecked} onChange={e => setCompletionChecked(e.target.checked)} className="rounded text-[var(--forest)] w-4 h-4 focus:ring-[#0B3B32]" />
                        <span className="text-sm text-gray-700">Service completion answered</span>
                     </label>
                   )}
                </div>
             </div>
             
             <div className="flex flex-wrap gap-3">
                <button onClick={handleSubmit} disabled={isSubmitting || !timeChecked || !mileageChecked || !signatureChecked || (isOdhh && !completionChecked)} className="bg-[#1B433C] text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-[#14332D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{isSubmitting ? "Submitting..." : "Submit actual hours"}</button>
                <button onClick={handleSaveDraft} className="bg-white border border-gray-300 text-gray-700 rounded-full px-5 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">Save draft</button>
                {isOdhh && (
                  <button className="bg-white border border-gray-300 text-[var(--forest)] rounded-full px-5 py-2 text-sm font-medium hover:bg-gray-50 transition-colors sm:ml-auto">
                    Open ODHH Portal
                  </button>
                )}
             </div>
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
          
          {isPastEndTime ? (
            <button onClick={() => setIsFormOpen(true)} className="bg-[#1B433C] text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-[#14332D] transition-colors">Submit actual hours</button>
          ) : (
            <p className="text-sm text-gray-500 font-medium">Not submitted (Awaiting end of assignment)</p>
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
            <button onClick={() => setIsFormOpen(true)} className="bg-[#1B433C] text-white hover:bg-[#14332D] rounded-full px-5 py-2 text-sm font-medium transition-colors">
              Edit draft / Submit actual hours
            </button>
          )}
          {currentState === 'correction_requested' && (
            <button onClick={() => setIsFormOpen(true)} className="bg-[#1B433C] text-white hover:bg-[#14332D] rounded-full px-5 py-2 text-sm font-medium transition-colors">
              Submit a correction
            </button>
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
  const [isOffersOpen, setIsOffersOpen] = useState(true);
  const [showGiveBackModal, setShowGiveBackModal] = useState(false);
  const [giveBackReason, setGiveBackReason] = useState("");
  const [isPending, startTransition] = React.useTransition();
  const [actingAction, setActingAction] = useState<'accept' | 'decline' | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleAccept = () => {
    setActingAction('accept');
    startTransition(async () => {
      await acceptJobOffer(job!.id);
      setActingAction(null);
    });
  };

  const handleDecline = () => {
    setActingAction('decline');
    startTransition(async () => {
      await declineOffer(id);
      setActingAction(null);
    });
  };

  const handleGiveBack = () => {
    setActingAction('decline'); // Reuse 'decline' or create a new 'giveBack' state, but 'decline' disables buttons which is good
    startTransition(async () => {
      if (job) {
        await giveBackAssignment(job.id, job.requestId, giveBackReason);
        setShowGiveBackModal(false);
        setActingAction(null);
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
            {job.status === 'pending' && (
              <span className="bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-full font-medium">
                Offers / draft
              </span>
            )}
            {job.status === 'booked' && (
              <span className="bg-[#E2EBE5] text-[#1B433C] text-[12px] px-3 py-1.5 rounded-full font-medium">
                Booked
              </span>
            )}
            <Link href="/interpreter-calendar" className="bg-white border border-gray-200 text-[var(--ink)] text-sm px-4 py-1.5 rounded-full hover:bg-gray-50 transition-colors ">
              View in calendar
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          
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

          {/* Virtual meeting details */}
          {job.isVirtual && (
            <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 ">
              <h2 className="text-[16px] font-semibold text-[var(--ink)] mb-4">Virtual meeting details</h2>
              <p className="text-[var(--ink)] text-sm mb-1">Not provided yet.</p>
              <p className="text-[var(--sage)] text-sm">Treat meeting links and access codes as restricted assignment information.</p>
            </div>
          )}

          {/* Card 2 */}
          <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 ">
            <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Preparation notes</h2>
            <p className="text-[14px] text-[var(--sage)]">No preparation notes yet.</p>
          </div>

          {/* Card 3 */}
          <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 ">
            <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Prep materials</h2>
            <p className="text-[14px] text-[var(--sage)]">No prep materials have been shared for this job.</p>
          </div>

          {/* Actual Service Time Component */}
          <ServiceTimeBlock job={job} />

          {/* Card 4 - Staffing */}
          <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 ">
            <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Staffing</h2>
            <p className="text-[14px] text-[var(--sage)] mb-8">Pending offers do not reserve time.</p>

            <h3 className="text-[16px] font-semibold text-[var(--ink)] mb-4">
              Your position · interpreter
            </h3>

            <div className="flex flex-wrap items-center gap-3 mb-6">
              {job.status === 'pending' ? (
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
                {job.status === 'pending' ? 'Unfilled' : 'You'}
              </span>
            </p>

            {job.status === 'pending' ? (
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
                    onClick={() => setIsOffersOpen(!isOffersOpen)}
                    className="w-full flex items-center gap-2 text-left focus:outline-none"
                  >
                    {isOffersOpen ? (
                      <ChevronDown className="w-4 h-4 text-gray-700" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-700" />
                    )}
                    <span className="font-medium text-sm text-[var(--ink)]">Previous offers (1)</span>
                  </button>
                  
                  {isOffersOpen && (
                    <div className="mt-4 flex items-center gap-2 pl-6">
                      <span className="text-[14px] text-gray-600">Your offer ·</span>
                      <span className="bg-white border border-gray-200 text-gray-600 text-[11px] font-medium px-2 py-0.5 rounded-full ">
                        Closed
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex justify-start gap-3 flex-wrap mt-2">
                  <button 
                    onClick={() => setShowGiveBackModal(true)}
                    className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-[13px] font-medium px-5 py-2 rounded-full transition-colors cursor-pointer"
                  >
                    Give back this assignment
                  </button>
                </div>
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
