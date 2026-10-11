"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { approveHours, requestHoursCorrection } from "@/app/actions/reviewHours";
import { fetchLiveRequests } from "@/app/actions/getRequests";

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

export interface ServiceRecord {
  id: string;
  appointmentId: string;
  interpreterName: string;
  state: 'not_started' | 'draft' | 'submitted' | 'awaiting_review' | 'changes_requested' | 'correction_requested' | 'approved';
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string;
  actualEnd: string;
  breakMinutes: number;
  reportedMileage: number;
  approvedMileage: number | null;
  reviewMessage: string | null;
  version: number;
  isOdhh?: boolean;
  travelStart?: string;
  travelEnd?: string;
  serviceCompleted?: string | boolean;
  mileageNote?: string;
  serviceNote?: string;
  history?: any[];
}

function ServiceRecordCard({ record, onUpdate }: { record: ServiceRecord, onUpdate: (r: ServiceRecord) => void }) {
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [hasException, setHasException] = useState(false);
  const [showSignatureError, setShowSignatureError] = useState(false);
  
  // Correction / Approval State
  const [correctionText, setCorrectionText] = useState("");
  const [showCorrectionError, setShowCorrectionError] = useState(false);
  
  const [mileageToApprove, setMileageToApprove] = useState(record.reportedMileage.toString());
  const [showMileageError, setShowMileageError] = useState(false);
  
  const [showViewSignatureError, setShowViewSignatureError] = useState(false);

  // calculate service time from actual start and actual end (mock string parsing)
  const actualStartDt = new Date(record.actualStart);
  const actualEndDt = new Date(record.actualEnd);
  
  // mock for "Tue, Sep 22 · 10:53 AM – 12:53 PM PDT"
  const formattedActual = `${actualStartDt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric'})} · ${actualStartDt.toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit'})} – ${actualEndDt.toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit', timeZoneName: 'short'})}`;
  
  const scheduledStartDt = new Date(record.scheduledStart);
  const scheduledEndDt = new Date(record.scheduledEnd);
  const formattedScheduled = `${scheduledStartDt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric'})} · ${scheduledStartDt.toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit'})} – ${scheduledEndDt.toLocaleTimeString('en-US', {hour: 'numeric', minute:'2-digit', timeZoneName: 'short'})}`;

  const formattedTravel = record.travelStart && record.travelEnd ? (() => {
    try {
      const ts = new Date(record.travelStart);
      const te = new Date(record.travelEnd);
      return `${ts.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${te.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;
    } catch (e) {
      return `${record.travelStart} – ${record.travelEnd}`;
    }
  })() : "None reported";

  const diffMs = actualEndDt.getTime() - actualStartDt.getTime();
  const serviceMinutes = Math.max(0, (diffMs / 60000) - (record.breakMinutes || 0));
  const serviceHours = (serviceMinutes / 60).toFixed(1);

  const handleApprove = async () => {
    if (!hasException) {
      setShowSignatureError(true);
      return;
    }
    const mileageNum = parseFloat(mileageToApprove);
    if (isNaN(mileageNum) || mileageNum < 0) {
      setShowMileageError(true);
      return;
    }
    setShowSignatureError(false);
    setShowMileageError(false);
    
    try {
      await approveHours(record.appointmentId, mileageNum);
    } catch (e) {
      console.error(e);
    }

    const prevHistory = Array.isArray(record.history) ? record.history : [];
    const approveEntry = {
      id: Math.random().toString(36).substring(7),
      type: 'approved',
      title: 'Hours approved and finalized',
      actor: 'Agency Staff',
      timestamp: new Date().toISOString(),
      version: record.version || 1,
      details: {
        approvedMileage: mileageNum,
      }
    };

    onUpdate({
      ...record,
      state: 'approved',
      approvedMileage: mileageNum,
      reviewMessage: null,
      history: [...prevHistory, approveEntry]
    });
  };

  const handleRequestCorrection = async () => {
    if (!correctionText.trim()) {
      setShowCorrectionError(true);
      return;
    }
    setShowCorrectionError(false);
    
    try {
      await requestHoursCorrection(record.appointmentId, correctionText);
    } catch (e) {
      console.error(e);
    }

    const prevHistory = Array.isArray(record.history) ? record.history : [];
    const corrEntry = {
      id: Math.random().toString(36).substring(7),
      type: 'correction_requested',
      title: 'Correction requested by agency',
      actor: 'Agency Staff',
      timestamp: new Date().toISOString(),
      version: record.version || 1,
      message: correctionText,
    };

    onUpdate({
      ...record,
      state: 'correction_requested',
      reviewMessage: correctionText,
      history: [...prevHistory, corrEntry]
    });
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 mb-4">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="font-semibold text-lg text-[var(--ink)] mb-6">Appointment {record.appointmentId}</h2>
          <h3 className="font-medium text-[16px] text-[var(--ink)]">{record.interpreterName}</h3>
        </div>
        <div className="flex flex-col items-end gap-5">
          <Link href={`/requests/${record.appointmentId}`} className="text-sm underline text-gray-700 hover:text-[var(--ink)] transition-colors">
            Open appointment
          </Link>
          {(record.state === 'submitted' || record.state === 'awaiting_review') && (
             <span className="px-3 py-1 text-[12px] font-medium rounded-full bg-purple-100 text-purple-700">Awaiting review</span>
          )}
          {record.state === 'approved' && (
             <span className="px-3 py-1 text-[12px] font-medium rounded-full bg-green-100 text-green-700">Approved</span>
          )}
          {(record.state === 'changes_requested' || record.state === 'correction_requested') && (
             <span className="px-3 py-1 text-[12px] font-medium rounded-full bg-orange-100 text-orange-700">Correction requested</span>
          )}
          {record.state === 'draft' && (
             <span className="px-3 py-1 text-[12px] font-medium rounded-full bg-gray-100 text-gray-700">Draft</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm mb-8">
        <div className="space-y-4">
          <div>
            <div className="text-[var(--sage)] mb-1">Scheduled booking</div>
            <div className="text-[var(--ink)]">{formattedScheduled}</div>
          </div>

          {record.isOdhh ? (
            <>
              <div>
                <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                  <span>Travel time</span>
                  {record.travelStart && (
                    <CopyButton text={formattedTravel} label="travel time" />
                  )}
                </div>
                <div className="text-[var(--ink)]">{formattedTravel}</div>
              </div>
              <div>
                <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
                  <span>Service completion</span>
                  <CopyButton
                    text={record.serviceCompleted === 'no' || record.serviceCompleted === false ? "No" : "Yes"}
                    label="service completion"
                  />
                </div>
                <div className="text-[var(--ink)] font-medium">
                  {record.serviceCompleted === 'no' || record.serviceCompleted === false ? "Not completed (No)" : "Completed (Yes)"}
                </div>
              </div>
            </>
          ) : (
            <div>
              <div className="text-[var(--sage)] mb-1">Unpaid break</div>
              <div className="text-[var(--ink)]">{record.breakMinutes > 0 ? `${record.breakMinutes} min` : 'None'}</div>
            </div>
          )}

          <div>
            <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
              <span>Mileage reported</span>
              <CopyButton text={`${record.reportedMileage.toFixed(1)} mi`} label="mileage reported" />
            </div>
            <div className="text-[var(--ink)]">{record.reportedMileage.toFixed(1)} mi</div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
              <span>Reported actual time</span>
              <CopyButton text={formattedActual} label="reported actual time" />
            </div>
            <div className="text-[var(--ink)]">{formattedActual}</div>
          </div>
          <div>
            <div className="text-[var(--sage)] mb-1 flex items-center justify-between">
              <span>Service time</span>
              <CopyButton text={`${serviceHours} hr`} label="service time" />
            </div>
            <div className="text-[var(--ink)]">{serviceHours} hr</div>
          </div>
          <div>
            <div className="text-[var(--sage)] mb-1">Mileage approved by the agency</div>
            <div className="text-[var(--ink)]">{record.state === 'approved' && record.approvedMileage !== null ? `${record.approvedMileage.toFixed(1)} mi` : 'Not approved yet'}</div>
          </div>
        </div>
      </div>

      {(record.mileageNote || record.serviceNote) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6 border-t border-gray-100 pt-4">
          {record.mileageNote && (
            <div>
              <div className="text-[var(--sage)] text-xs mb-1 flex items-center justify-between">
                <span>Mileage note</span>
                <CopyButton text={record.mileageNote} label="mileage note" />
              </div>
              <div className="text-[var(--ink)] text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                {record.mileageNote}
              </div>
            </div>
          )}
          {record.serviceNote && (
            <div>
              <div className="text-[var(--sage)] text-xs mb-1 flex items-center justify-between">
                <span>Service note</span>
                <CopyButton text={record.serviceNote} label="service note" />
              </div>
              <div className="text-[var(--ink)] text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                {record.serviceNote}
              </div>
            </div>
          )}
        </div>
      )}

      {record.state === 'approved' && (
        <div className="text-sm text-gray-600 mb-6 border-t border-gray-200 pt-4">
          Approved {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - v{record.version}. Locked. Approval confirms the service record only; it is not a payment.
        </div>
      )}

      <div className="mb-6">
        <button 
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} 
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2"
        >
          {isHistoryExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Version history ({record.version})
        </button>
        {isHistoryExpanded && (
          <div className="text-xs text-[var(--sage)] mb-4 pl-4 space-y-2 border-l-2 border-gray-200">
            {Array.isArray(record.history) && record.history.length > 0 ? (
              record.history.map((evt: any, i: number) => (
                <div key={evt.id || i} className="text-gray-700">
                  <span className="font-semibold">{evt.title}</span> (v{evt.version || 1}) · by {evt.actor || 'System'}
                  {evt.message && <p className="text-amber-800 text-[11px] mt-0.5">"{evt.message}"</p>}
                </div>
              ))
            ) : (
              <div>v{record.version} · submitted by {record.interpreterName} · {actualEndDt.toLocaleDateString('en-US')}</div>
            )}
          </div>
        )}
      </div>

      {(record.state === 'submitted' || record.state === 'awaiting_review') ? (
        <div className="bg-[#F5F4F0] p-4 md:p-5 rounded-xl mb-6">
          <h4 className="text-sm font-medium text-[var(--ink)] mb-1">Service-verification signature</h4>
          <p className="text-sm text-[var(--sage)]">No signature has been collected yet.</p>
        </div>
      ) : (
        <div className="bg-[#F5F4F0] p-4 md:p-5 rounded-xl mb-6">
          <h4 className="text-sm font-medium text-[var(--ink)] mb-1">Service-verification signature</h4>
          <p className="text-sm text-[var(--sage)] mb-4">Signed on {actualEndDt.toLocaleDateString('en-US')}.</p>
          <button 
            onClick={() => setShowViewSignatureError(true)}
            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full px-4 py-1.5 text-sm font-medium transition-colors mb-2"
          >
            View signature
          </button>
          {showViewSignatureError && (
            <p className="text-[#C23B22] text-sm mt-1">That signature could not be opened. Try again.</p>
          )}
        </div>
      )}

      {(record.state === 'submitted' || record.state === 'awaiting_review') && (
        <div className="bg-[#F5F4F0] p-4 md:p-5 rounded-xl">
          <label className="flex items-start gap-3 cursor-pointer mb-6">
            <input 
              type="checkbox" 
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]" 
              checked={hasException}
              onChange={(e) => {
                setHasException(e.target.checked);
                setShowSignatureError(false);
              }}
            />
            <span className="text-sm text-gray-700">Record a signature exception (demo bypass)</span>
          </label>
          <div className="mb-5">
            <label className="block text-xs text-gray-600 mb-2">Mileage to approve (reported: {record.reportedMileage.toFixed(1)} mi)</label>
            <input 
              type="text" 
              value={mileageToApprove} 
              onChange={(e) => setMileageToApprove(e.target.value)} 
              className="w-full sm:w-[200px] bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow" 
            />
            {showMileageError && <p className="text-[#C23B22] text-xs mt-1">Please enter a valid non-negative number.</p>}
          </div>
          <div className="mb-5">
            <label className="block text-xs text-gray-600 mb-2">Message to the interpreter (required to request a correction)</label>
            <textarea 
              rows={4} 
              value={correctionText}
              onChange={(e) => {
                setCorrectionText(e.target.value);
                setShowCorrectionError(false);
              }}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow resize-none"
            ></textarea>
            {showCorrectionError && <p className="text-[#C23B22] text-xs mt-1">Say what needs correcting so the interpreter can fix it</p>}
          </div>
          {showSignatureError && <p className="text-[#C23B22] text-sm mb-4">This assignment needs a service-verification signature, or a recorded exception, before it can be approved</p>}
          <div className="flex flex-col sm:flex-row gap-3 w-full mb-4">
            <button 
              onClick={handleApprove}
              className="w-full sm:w-auto bg-[#145347] text-white hover:bg-[#0f4037] rounded-full px-6 py-2.5 text-sm font-medium transition-colors"
            >
              Approve service record
            </button>
            <button 
              onClick={handleRequestCorrection}
              className="w-full sm:w-auto bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full px-6 py-2.5 text-sm font-medium transition-colors"
            >
              Request a correction
            </button>
          </div>
          <p className="text-xs text-[var(--sage)] leading-relaxed">
            Approving confirms what was worked and the mileage the agency accepts. It does not calculate pay, rates or an invoice, and it never overwrites what the interpreter submitted.
          </p>
        </div>
      )}
    </div>
  );
}

export default function HoursReviewPage() {
  const [activeTab, setActiveTab] = useState<'awaiting' | 'all'>('awaiting');
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  
  useEffect(() => {
    const loadRecords = async () => {
      let localRecords: ServiceRecord[] = [];
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('terpdesk_service_records');
        if (stored) {
          try {
            localRecords = JSON.parse(stored);
          } catch (e) {
            console.error('Failed to parse records', e);
          }
        }
      }
      try {
        const dbRequests = await fetchLiveRequests();
        const merged = [...localRecords];
        for (const req of dbRequests) {
          const hoursSub = req.data?.hoursSubmission;
          const isEligibleStatus = ['awaiting_review', 'correction_requested', 'approved'].includes(req.status);
          if (hoursSub || isEligibleStatus) {
            const existingIdx = merged.findIndex(r => r.appointmentId === req.id);
            const isOdhh = req.data?.intake?.program === 'WA ODHH' || req.data?.intake?.program === 'wa_odhh' || req.requester?.org === 'WA ODHH';
            const acceptedOffer = req.offers?.find((o: any) => o.status === 'accepted');
            const state: ServiceRecord['state'] = req.status === 'approved' 
              ? 'approved' 
              : req.status === 'correction_requested' 
                ? 'correction_requested' 
                : 'awaiting_review';
            const mappedRecord: ServiceRecord = {
              id: req.id,
              appointmentId: req.id,
              interpreterName: acceptedOffer?.interpreterName || "Jamie Fictional",
              state: state,
              scheduledStart: req.startsAt,
              scheduledEnd: req.endsAt,
              actualStart: hoursSub?.actualStartTime || req.startsAt,
              actualEnd: hoursSub?.actualEndTime || req.endsAt,
              breakMinutes: hoursSub?.breakMinutes || 0,
              reportedMileage: hoursSub?.miles || 0,
              approvedMileage: hoursSub?.approvedMileage ?? null,
              reviewMessage: hoursSub?.reviewMessage ?? null,
              version: hoursSub?.version || 1,
              isOdhh: isOdhh,
              travelStart: req.travelStartTime || hoursSub?.travelStartTime || req.startsAt,
              travelEnd: req.travelEndTime || hoursSub?.travelEndTime || req.endsAt,
              serviceCompleted: req.serviceCompleted ?? hoursSub?.serviceCompleted ?? true,
              mileageNote: hoursSub?.mileageNote || "",
              serviceNote: hoursSub?.note || "",
              history: hoursSub?.history || []
            };
            if (existingIdx > -1) {
              merged[existingIdx] = {
                ...mappedRecord,
                ...merged[existingIdx],
                state: merged[existingIdx].state || state,
                isOdhh: merged[existingIdx].isOdhh ?? isOdhh,
                history: hoursSub?.history?.length ? hoursSub.history : (merged[existingIdx].history || mappedRecord.history),
              };
            } else {
              merged.push(mappedRecord);
            }
          }
        }
        setRecords(merged);
        if (typeof window !== 'undefined') {
          localStorage.setItem('terpdesk_service_records', JSON.stringify(merged));
        }
      } catch (e) {
        console.error("Failed to fetch live requests for hours review", e);
        setRecords(localRecords);
      }
    };
    loadRecords();
    window.addEventListener('storage', loadRecords);
    return () => window.removeEventListener('storage', loadRecords);
  }, []);

  const handleUpdateRecord = (updatedRecord: ServiceRecord) => {
    const newRecords = records.map(r => r.id === updatedRecord.id ? updatedRecord : r);
    setRecords(newRecords);
    if (typeof window !== 'undefined') {
      localStorage.setItem('terpdesk_service_records', JSON.stringify(newRecords));
      window.dispatchEvent(new Event('storage'));
    }
  };
  
  const awaitingRecords = records.filter(r => r.state === 'submitted' || r.state === 'awaiting_review');
  const submittedCount = awaitingRecords.length;
  const allCount = records.length;
  
  const displayedRecords = activeTab === 'awaiting' ? awaitingRecords : records;

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 space-y-6 pb-24 antialiased pt-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--ink)] mb-2">Hours review</h1>
        <p className="text-sm text-[var(--sage)] mb-6">
          Reported service time awaiting your confirmation. Approval records the service; it does not create pay or an invoice.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <button 
          onClick={() => setActiveTab('awaiting')}
          className={`w-full sm:w-auto px-5 py-2.5 transition-colors text-sm font-medium rounded-full ${
            activeTab === 'awaiting' 
              ? 'bg-[#145347] text-white hover:bg-[#0f4037]' 
              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 '
          }`}
        >
          Awaiting review ({submittedCount})
        </button>
        <button 
          onClick={() => setActiveTab('all')}
          className={`w-full sm:w-auto px-5 py-2.5 transition-colors text-sm font-medium rounded-full ${
            activeTab === 'all' 
              ? 'bg-[#145347] text-white hover:bg-[#0f4037]' 
              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 '
          }`}
        >
          All reported hours ({allCount})
        </button>
      </div>

      <div className="flex flex-col gap-6 w-full">
        {displayedRecords.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center flex flex-col items-center justify-center">
            <h3 className="text-lg font-medium text-[var(--ink)] mb-2">No service records found</h3>
            <p className="text-sm text-[var(--sage)]">There are currently no records to review.</p>
          </div>
        ) : (
          displayedRecords.map(record => (
            <ServiceRecordCard key={record.id} record={record} onUpdate={handleUpdateRecord} />
          ))
        )}
      </div>
    </div>
  );
}
