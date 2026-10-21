"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRequests } from "@/context/RequestsContext";
import { useGlobalState } from "@/context/GlobalContext";
import { ChevronDown, Copy, Check, ExternalLink, Video, MapPin, Edit2, X, Lock, Clock, Building2 } from "lucide-react";
import { fetchLiveRequestById } from "@/app/actions/getRequests";
import { updateRequestDetails } from "@/app/actions/updateRequestDetails";
import { removeBooking } from "@/app/actions/removeBooking";
import { assignInterpreter } from "@/app/actions/assignInterpreter";
import { getInterpreters } from "@/app/actions/getInterpreters";
import { createOffer } from "@/app/actions/createOffer";
import { updateOfferStatus } from "@/app/actions/updateOfferStatus";
import { cancelRequest } from "@/app/actions/cancelRequest";
import { wallClockToUtc, wallClockToUtcDate, getIanaZone, resolveRequestTimes } from "@/utils/timezone";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { isAppointmentHappeningNow, isUnfilledPastDue } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { formatReference } from "@/utils/statusEngine";
import { getInterpretersFitForJob } from "@/app/actions/availability";
import type { InterpreterFitStatus } from "@/app/actions/availability";
import { InterpreterFitBadge, FitWarningNotice } from "@/components/scheduling-ui";
import { RequestTimesheetButton } from "@/components/features/RequestTimesheetButton";
import { PrepMaterialsSection } from "@/components/requests/PrepMaterialsSection";
import { ExpiredOfferNotice, pastOfferNote } from "@/components/requests/ExpiredOfferNotice";
import { ResendDetailsButton } from "@/components/requests/ResendDetailsButton";
import { ClarificationsCard } from "@/components/requests/ClarificationsCard";
import { RequestActivityCard } from "@/components/requests/RequestActivityCard";
import { legacyPosition1Hours } from "@/utils/hoursState";
import { bookedRecipients, defaultRecipient } from "@/utils/messageRecipients";
import { MessageRecipientSelect } from "@/components/requests/MessageRecipientSelect";
import { getTimesheetStatus } from "@/app/actions/getTimesheetStatus";
import { getAutoBookEligibility } from "@/app/actions/getAutoBookEligibility";
import { getClientsAction } from "@/app/actions/clients";
import type { ClientWithStats } from "@/app/actions/clients";
import { ClientAssignmentBanner } from "@/components/features/ClientAssignmentBanner";
import { normalizeClientType } from "@/lib/validation/client";
import { isStateJobRequest } from "@/lib/stateJob";
import type { TimesheetFlags } from "@/app/actions/getTimesheetStatus";

const fitOptionLabels: Record<InterpreterFitStatus, string> = {
  available: "Available",
  unavailable: "Unavailable",
  outside_hours: "Outside usual hours",
  not_provided: "Hours not provided",
  not_shared: "Not shared",
};

function getInterpreterOptionLabel(
  name: string,
  email: string | undefined,
  fit: InterpreterFitStatus | undefined,
  isLoading: boolean,
  hasError: boolean,
  pastNote?: string | null
): string {
  const identifier = email ? `${name} (${email})` : name;
  let label: string;
  if (fit) label = `${identifier} — ${fitOptionLabels[fit]}`;
  else if (hasError) label = `${identifier} — Availability check failed`;
  else label = isLoading ? `${identifier} — Checking availability…` : `${identifier} — Availability status unavailable`;
  // An interpreter who already had an offer on this slot stays in the list, flagged (e.g. "Offer expired").
  return pastNote ? `${label} · ${pastNote}` : label;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "The availability service returned an unexpected response.";
}

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

function CollapsiblePreviousOffers({
  pastOffers,
  isAppointmentFinished,
  apptTz,
}: {
  pastOffers: any[];
  isAppointmentFinished: boolean;
  apptTz?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!pastOffers || pastOffers.length === 0) return null;

  return (
    <div className="bg-[#F5F4F0] rounded-xl p-4 mb-6 transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left focus:outline-none cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`w-4 h-4 text-gray-700 transition-transform duration-200 ${
              isOpen ? "rotate-0" : "-rotate-90"
            }`}
          />
          <span className="font-medium text-sm text-[var(--ink)]">
            Previous offers ({pastOffers.length})
          </span>
        </div>
        <span className="text-xs text-[var(--sage)] font-normal group-hover:text-gray-700 transition-colors">
          {isOpen ? "Hide" : "Show"}
        </span>
      </button>

      {isOpen && (
        <div className="mt-3.5 space-y-3 pt-3 border-t border-gray-200/60">
          {pastOffers.map((offer: any, idx: number) => {
            const rawState = offer.status || offer.state || 'pending';
            const deadlineMs = offer.expiresAt ? new Date(offer.expiresAt).getTime() : NaN;
            const deadlinePassed = !Number.isNaN(deadlineMs) && Date.now() > deadlineMs;
            const isExpired = rawState === 'expired' || (rawState === 'pending' && (isAppointmentFinished || deadlinePassed));
            const displayState = isExpired ? 'expired' : rawState;

            let badgeClass = "bg-white border border-gray-200 text-gray-600";
            if (isExpired) {
              badgeClass = "bg-amber-100 text-amber-900 border border-amber-300 font-semibold";
            } else if (displayState === 'withdrawn') {
              badgeClass = "bg-gray-100 text-gray-700 border border-gray-200";
            } else if (displayState === 'declined') {
              badgeClass = "bg-red-50 text-red-700 border border-red-200";
            }

            return (
              <div key={idx} className="last:mb-0">
                <div className="flex items-center gap-2 pl-6 flex-wrap">
                  <span className="text-xs sm:text-sm text-gray-700 font-medium">{offer.interpreterName} ·</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${badgeClass}`}>
                    {isExpired ? 'Expired' : displayState}
                  </span>
                </div>
                <div className="text-xs sm:text-sm text-[var(--sage)] pl-6 mt-1 text-wrap">
                  {isExpired ? (
                    <span>{isAppointmentFinished ? 'Expired · Appointment ended before response was submitted' : 'Expired · No response before the offer deadline'}</span>
                  ) : (
                    <span>
                      {displayState.charAt(0).toUpperCase() + displayState.slice(1)} {(() => {
                        try {
                          const d = parseSafeDate(offer.expiresAt);
                          if (!d) return '';
                          return formatInTimeZone(d, mapSafeZone(apptTz), 'MMM d, h:mm a');
                        } catch (e) {
                          return '';
                        }
                      })()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
  const [interpreterFitMap, setInterpreterFitMap] = useState<Record<string, InterpreterFitStatus>>({});
  const [isInterpreterFitLoading, setIsInterpreterFitLoading] = useState(true);
  const [interpreterFitError, setInterpreterFitError] = useState<string | null>(null);

  useEffect(() => {
    getInterpreters().then(setDbInterpreters).catch(console.error);
  }, []);

  // Real auto-book permission per interpreter (sharing on AND auto-book on), read from the database.
  const [autoBookAllowed, setAutoBookAllowed] = useState<Record<string, boolean>>({});
  const [autoBookErrors, setAutoBookErrors] = useState<Record<number, string>>({});
  useEffect(() => {
    if (dbInterpreters.length === 0) return;
    getAutoBookEligibility(dbInterpreters.map((m: any) => String(m.id))).then(setAutoBookAllowed).catch(() => setAutoBookAllowed({}));
  }, [dbInterpreters]);

  const activeRoster = dbInterpreters.map(m => ({
    id: m.id,
    name: m.name,
    email: m.email,
    isAutoFillEligible: interpreterFitMap[m.id] === 'available' || interpreterFitMap[m.id] === 'outside_hours' || interpreterFitMap[m.id] === undefined
  }));

  const [recipient1, setRecipient1] = useState('');
  const [autoBookRecipient1, setAutoBookRecipient1] = useState('');
  const [expiryDate1, setExpiryDate1] = useState('');
  const [expiryTime1, setExpiryTime1] = useState('');
  const [errorMessage1, setErrorMessage1] = useState('');
  const [successMessage1, setSuccessMessage1] = useState('');
  const [isSendingOffer1, setIsSendingOffer1] = useState(false);
  const [isEligible1, setIsEligible1] = useState<boolean | null>(null);

  const [recipient2, setRecipient2] = useState('');
  const [autoBookRecipient2, setAutoBookRecipient2] = useState('');
  const [expiryDate2, setExpiryDate2] = useState('');
  const [expiryTime2, setExpiryTime2] = useState('');
  const [errorMessage2, setErrorMessage2] = useState('');
  const [successMessage2, setSuccessMessage2] = useState('');
  const [isSendingOffer2, setIsSendingOffer2] = useState(false);
  const [isEligible2, setIsEligible2] = useState<boolean | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 5000);
  };

  const [foundRequest, setFoundRequest] = useState<any>(null);
  const [clientsOnFile, setClientsOnFile] = useState<ClientWithStats[]>([]);
  useEffect(() => {
    getClientsAction().then(setClientsOnFile).catch(() => setClientsOnFile([]));
  }, []);
  const [timesheetFlags, setTimesheetFlags] = useState<Record<string, TimesheetFlags>>({});
  const loadTimesheetFlags = React.useCallback(async (requestId: string) => {
    try {
      setTimesheetFlags(await getTimesheetStatus(requestId));
    } catch {
      setTimesheetFlags({});
    }
  }, []);
  useEffect(() => {
    if (foundRequest?.id) void loadTimesheetFlags(String(foundRequest.id));
  }, [foundRequest?.id, loadTimesheetFlags]);
  const [isLoading, setIsLoading] = useState(true);

  const totalPositions = (
    foundRequest?.totalPositions || 
    foundRequest?.slotCount || 
    foundRequest?.data?.totalPositions || 
    foundRequest?.data?.slotCount || 
    (foundRequest?.positions === "Team — two independent positions" ? 2 : 1)
  ) as 1 | 2;

  const isCancelled = foundRequest?.status === 'Cancelled' || foundRequest?.status === 'cancelled';
  const realOffers = foundRequest?.offers || [];

  const slot1Accepted = realOffers.find((o: any) => (o.positionIndex === 1 || !o.positionIndex) && (o.state === 'accepted' || o.status === 'accepted')) || (
    foundRequest?.slots?.find((s: any) => s.positionIndex === 1 && s.reservedBy)
      ? { interpreterName: foundRequest.slots.find((s: any) => s.positionIndex === 1).interpreterName || 'Booked', interpreterId: foundRequest.slots.find((s: any) => s.positionIndex === 1).reservedBy, id: 'assigned-1', positionIndex: 1 }
      : (foundRequest?.assignedInterpreterId || foundRequest?.data?.assignedInterpreterId
          ? { interpreterName: foundRequest.assignedInterpreterName || foundRequest?.data?.assignedInterpreterName || 'Booked', interpreterId: foundRequest.assignedInterpreterId || foundRequest?.data?.assignedInterpreterId, id: 'assigned-root', positionIndex: 1 }
          : ((totalPositions === 1 && (foundRequest?.status === 'assigned' || foundRequest?.status === 'booked') && foundRequest?.assignedInterpreterName)
            ? { interpreterName: foundRequest.assignedInterpreterName, id: 'assigned-booking', positionIndex: 1 }
            : null))
  );

  const slot2Accepted = totalPositions === 2 ? (
    realOffers.find((o: any) => o.positionIndex === 2 && (o.state === 'accepted' || o.status === 'accepted')) || (
      foundRequest?.slots?.find((s: any) => s.positionIndex === 2 && s.reservedBy)
        ? { interpreterName: foundRequest.slots.find((s: any) => s.positionIndex === 2).interpreterName || 'Booked', interpreterId: foundRequest.slots.find((s: any) => s.positionIndex === 2).reservedBy, id: 'assigned-2', positionIndex: 2 }
        : (foundRequest?.position2InterpreterId || foundRequest?.data?.position2InterpreterId
            ? { interpreterName: foundRequest.position2InterpreterName || foundRequest?.data?.position2InterpreterName || 'Booked', interpreterId: foundRequest.position2InterpreterId || foundRequest?.data?.position2InterpreterId, id: 'assigned-pos2', positionIndex: 2 }
            : null)
    )
  ) : null;

  const appointmentEndsAtMs = foundRequest?.endsAt ? new Date(foundRequest.endsAt).getTime() : 0;
  const isAppointmentFinished = appointmentEndsAtMs > 0 && currentTime > appointmentEndsAtMs;

  const isLiveOffer = (o: any) => {
    if (!o) return false;
    const st = o.status || o.state;
    if (st !== 'pending') return false;
    if (o.status === 'expired' || o.state === 'expired') return false;
    if (isAppointmentFinished) return false;
    if (o.expiresAt) {
      const expMs = new Date(o.expiresAt).getTime();
      if (!isNaN(expMs) && currentTime > expMs) return false;
    }
    return true;
  };

  const slot1ActiveOffer = realOffers.find((o: any) => (o.positionIndex === 1 || !o.positionIndex) && isLiveOffer(o));
  const slot2ActiveOffer = totalPositions === 2 ? realOffers.find((o: any) => o.positionIndex === 2 && isLiveOffer(o)) : null;

  const slot1PastOffers = realOffers.filter((o: any) => (o.positionIndex === 1 || !o.positionIndex) && o.id !== slot1ActiveOffer?.id && o.id !== slot1Accepted?.id);
  const slot2PastOffers = totalPositions === 2 ? realOffers.filter((o: any) => o.positionIndex === 2 && o.id !== slot2ActiveOffer?.id && o.id !== slot2Accepted?.id) : [];

  const staffedCount = (slot1Accepted ? 1 : 0) + (slot2Accepted ? 1 : 0);
  const isAllPositionsFilled = staffedCount >= totalPositions && totalPositions > 0;

  const slot1Slot = foundRequest?.slots?.find((s: any) => s.positionIndex === 1);
  const slot2Slot = totalPositions === 2 ? foundRequest?.slots?.find((s: any) => s.positionIndex === 2) : null;

  const slot1NeedsReplacement = !isAllPositionsFilled && !slot1Accepted && Boolean(slot1Slot?.needsReplacement || foundRequest?.data?.slotReplacements?.[1]);
  const slot2NeedsReplacement = !isAllPositionsFilled && !slot2Accepted && Boolean(slot2Slot?.needsReplacement || foundRequest?.data?.slotReplacements?.[2]);

  // Rule — No Duplicate Interpreter Across Slots (Prevent Position Duplication)
  const isOccupiedInSlot1 = (interpId: string, interpName?: string) => {
    // Currently selected in Position 1
    if (recipient1 && recipient1 === interpId) return true;
    if (autoBookRecipient1 && autoBookRecipient1 === interpId) return true;

    // Currently assigned or offered in Position 1
    if (slot1Accepted) {
      if (slot1Accepted.interpreterId && slot1Accepted.interpreterId === interpId) return true;
      if (interpName && slot1Accepted.interpreterName && slot1Accepted.interpreterName.trim().toLowerCase() === interpName.trim().toLowerCase()) return true;
    }
    const slot1Reserved = slot1Slot?.reservedBy || foundRequest?.assignedInterpreterId || foundRequest?.data?.assignedInterpreterId;
    if (slot1Reserved && slot1Reserved === interpId) return true;
    if (slot1ActiveOffer) {
      if (slot1ActiveOffer.interpreterId && slot1ActiveOffer.interpreterId === interpId) return true;
      if (interpName && slot1ActiveOffer.interpreterName && slot1ActiveOffer.interpreterName.trim().toLowerCase() === interpName.trim().toLowerCase()) return true;
    }
    return false;
  };

  const isOccupiedInSlot2 = (interpId: string, interpName?: string) => {
    // Currently selected in Position 2
    if (recipient2 && recipient2 === interpId) return true;
    if (autoBookRecipient2 && autoBookRecipient2 === interpId) return true;

    // Currently assigned or offered in Position 2
    if (slot2Accepted) {
      if (slot2Accepted.interpreterId && slot2Accepted.interpreterId === interpId) return true;
      if (interpName && slot2Accepted.interpreterName && slot2Accepted.interpreterName.trim().toLowerCase() === interpName.trim().toLowerCase()) return true;
    }
    const slot2Reserved = slot2Slot?.reservedBy || foundRequest?.position2InterpreterId || foundRequest?.data?.position2InterpreterId;
    if (slot2Reserved && slot2Reserved === interpId) return true;
    if (slot2ActiveOffer) {
      if (slot2ActiveOffer.interpreterId && slot2ActiveOffer.interpreterId === interpId) return true;
      if (interpName && slot2ActiveOffer.interpreterName && slot2ActiveOffer.interpreterName.trim().toLowerCase() === interpName.trim().toLowerCase()) return true;
    }
    return false;
  };

  const rosterSlot1 = activeRoster.filter(i => !isOccupiedInSlot2(i.id, i.name));
  const rosterSlot2 = activeRoster.filter(i => !isOccupiedInSlot1(i.id, i.name));

  const hasLivePendingOffer = Boolean(
    slot1ActiveOffer ||
    slot2ActiveOffer ||
    (!isAppointmentFinished && realOffers.some((o: any) => isLiveOffer(o)))
  );

  const hasAcceptedBooking = Boolean(
    slot1Accepted ||
    slot2Accepted ||
    ['assigned', 'booked', 'Fully staffed'].includes(foundRequest?.status) ||
    realOffers.some((o: any) => o.status === 'accepted' || o.state === 'accepted')
  );

  const hasActiveOrAcceptedOffers = hasLivePendingOffer || hasAcceptedBooking;
  const isFrozen = isCancelled || hasActiveOrAcceptedOffers;

  // Edit lock, mirroring offerLock.ts (the server enforces it too): a live offer always locks; a booking only once the
  // appointment has started. Editing a booked future job is allowed and emails the booked interpreter what changed.
  const editLockStartMs = (() => {
    try {
      return new Date(resolveRequestTimes({ createdAt: foundRequest?.createdAt, data: foundRequest?.data || foundRequest }).startsAt).getTime();
    } catch {
      return Number.NaN;
    }
  })();
  const bookingStarted = hasAcceptedBooking && !Number.isNaN(editLockStartMs) && currentTime >= editLockStartMs;
  const isEditLocked = hasLivePendingOffer || bookingStarted;
  const editLockMessage = hasLivePendingOffer
    ? "This appointment can't be edited while an offer is waiting for a response. Once every pending offer has been accepted, declined or has expired, you can edit it."
    : "This appointment has already started, so its booked details can no longer be edited.";
  // While an interpreter is booked, date, time and time zone are fixed (the server ignores them too).
  const isScheduleLocked = hasAcceptedBooking && !isEditLocked;
  const [quickEditMessage, setQuickEditMessage] = useState('');
  // Team jobs: the message goes to one booked interpreter (the one being replied to), never the whole team.
  const messageRecipients = bookedRecipients(realOffers);
  const [quickEditRecipient, setQuickEditRecipient] = useState('');
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);

 const [showCancelModal, setShowCancelModal] = useState(false);
 const [cancelReasonInput, setCancelReasonInput] = useState('');
 const [clientRequested, setClientRequested] = useState(false);
 const cancelReason = foundRequest?.cancelReason || cancelReasonInput;
 const cancelDate = foundRequest?.canceledAt || '';

  // Quick-update access & location state
  const [isEditAccessOpen, setIsEditAccessOpen] = useState(false);
  const [editSetting, setEditSetting] = useState('Medical');
  const [editFormat, setEditFormat] = useState('Virtual');
  const [editPlatform, setEditPlatform] = useState('Zoom');
  const [editMeetingLink, setEditMeetingLink] = useState('');
  const [editMeetingId, setEditMeetingId] = useState('');
  const [editPasscode, setEditPasscode] = useState('');
  const [editVirtualInstructions, setEditVirtualInstructions] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editBuilding, setEditBuilding] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editContactMethod, setEditContactMethod] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editTimeZone, setEditTimeZone] = useState('Pacific Time — Seattle, Los Angeles');
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  let isQuickEditTimeInvalid = false;
  if (editStartDate && editStartTime && editEndDate && editEndTime) {
    try {
      const ianaTz = getIanaZone(editTimeZone);
      const startUtc = fromZonedTime(`${editStartDate}T${editStartTime}:00`, ianaTz);
      const endUtc = fromZonedTime(`${editEndDate}T${editEndTime}:00`, ianaTz);
      isQuickEditTimeInvalid = endUtc.getTime() <= startUtc.getTime();
    } catch (e) {
      isQuickEditTimeInvalid = new Date(`${editStartDate}T${editStartTime}`) >= new Date(`${editEndDate}T${editEndTime}`);
    }
  }

  const openEditAccessModal = () => {
    const isVirt = foundRequest?.isVirtual ?? (foundRequest?.details?.format?.toLowerCase().includes('virtual') ?? true);
    setEditSetting(foundRequest?.setting || foundRequest?.details?.setting || 'Medical');
    setEditFormat(foundRequest?.format || foundRequest?.details?.format || (isVirt ? 'Virtual' : 'In person'));
    setEditPlatform(foundRequest?.platform || foundRequest?.details?.platform || 'Zoom');
    setEditMeetingLink(foundRequest?.meetingLink || foundRequest?.details?.meetingLink || foundRequest?.virtualLink || foundRequest?.details?.virtualLink || '');
    setEditMeetingId(foundRequest?.meetingId || foundRequest?.details?.meetingId || '');
    setEditPasscode(foundRequest?.passcode || foundRequest?.details?.passcode || foundRequest?.accessCode || foundRequest?.details?.accessCode || '');
    setEditVirtualInstructions(foundRequest?.virtualInstructions || foundRequest?.details?.virtualInstructions || '');
    setEditVenue(foundRequest?.onsite?.venue || '');
    setEditAddress(foundRequest?.onsite?.address || '');
    setEditBuilding(foundRequest?.onsite?.building || '');
    setEditContact(foundRequest?.onsite?.contact || '');
    setEditContactMethod(foundRequest?.onsite?.contactMethod || '');

    // Pre-fill date and time in the appointment's target timezone
    const apptTz = foundRequest?.details?.timeZone || foundRequest?.timeZone || 'Pacific Time — Seattle, Los Angeles';
    const safeZone = getIanaZone(apptTz);
    const sDate = parseSafeDate(foundRequest?.startsAt) || new Date();
    const eDate = parseSafeDate(foundRequest?.endsAt) || new Date(sDate.getTime() + 3600000);

    setEditStartDate(formatInTimeZone(sDate, safeZone, 'yyyy-MM-dd'));
    setEditStartTime(formatInTimeZone(sDate, safeZone, 'HH:mm'));
    setEditEndDate(formatInTimeZone(eDate, safeZone, 'yyyy-MM-dd'));
    setEditEndTime(formatInTimeZone(eDate, safeZone, 'HH:mm'));
    setEditTimeZone(apptTz);

    setSaveError(null);
    setQuickEditMessage('');
    setQuickEditRecipient(defaultRecipient(messageRecipients, foundRequest?.data?.clarifications));
    setIsEditAccessOpen(true);
  };

  const handleSaveAccess = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isEditLocked) {
      setSaveError(editLockMessage);
      return;
    }
    if (!isScheduleLocked && isQuickEditTimeInvalid) return;
    setIsSavingAccess(true);
    setSaveError(null);
    try {
      const result = await updateRequestDetails({
        requestId: id,
        setting: editSetting,
        format: editFormat,
        platform: editPlatform,
        meetingLink: editMeetingLink,
        meetingId: editMeetingId,
        passcode: editPasscode,
        virtualInstructions: editVirtualInstructions,
        venue: editVenue,
        address: editAddress,
        building: editBuilding,
        contact: editContact,
        contactMethod: editContactMethod,
        ...(isScheduleLocked
          ? { messageToInterpreter: quickEditMessage, messageRecipientId: quickEditRecipient || undefined }
          : {
              startDate: editStartDate,
              startTime: editStartTime,
              endDate: editEndDate,
              endTime: editEndTime,
              timeZone: editTimeZone,
            }),
      });
      if (!result.success) {
        // The server enforces the same lock; show its reason instead of a generic failure.
        setSaveError(result.error);
        return;
      }
      const updatedRow = result.request;
      setActivityVersion((v) => v + 1);
      setQuickEditMessage('');
      setEditNotice(
        result.notifiedInterpreters > 0
          ? `Saved. ${result.notifiedInterpreters === 1 ? "The booked interpreter was" : `${result.notifiedInterpreters} booked interpreters were`} emailed what changed.`
          : null,
      );

      const updated = await fetchLiveRequestById(id);
      setFoundRequest(updated);

      if (typeof window !== 'undefined') {
        try {
          const storedJobs = JSON.parse(localStorage.getItem('terpdesk_interpreter_jobs') || '[]');
          const idx = storedJobs.findIndex((j: any) => String(j.id) === String(id) || String(j.requestId) === String(id));
          if (idx > -1) {
            const isVirt = editFormat.toLowerCase().includes('virtual');
            const newStartsAt = updated?.startsAt || (updatedRow?.data as any)?.startsAt;
            const newEndsAt = updated?.endsAt || (updatedRow?.data as any)?.endsAt;
            storedJobs[idx] = {
              ...storedJobs[idx],
              setting: editSetting,
              format: editFormat,
              isVirtual: isVirt,
              startsAt: newStartsAt || storedJobs[idx].startsAt,
              endsAt: newEndsAt || storedJobs[idx].endsAt,
              timeZone: editTimeZone,
              location: isVirt
                ? (editPlatform ? `${editPlatform} (Virtual)` : 'Virtual')
                : (editVenue ? (editAddress ? `${editVenue} · ${editAddress}` : editVenue) : 'In person'),
              meetingLink: editMeetingLink,
              virtualLink: editMeetingLink,
              meetingId: editMeetingId,
              passcode: editPasscode,
              accessCode: editPasscode,
              platform: editPlatform,
              virtualInstructions: editVirtualInstructions,
              details: {
                ...(storedJobs[idx].details || {}),
                setting: editSetting,
                format: editFormat,
                timeZone: editTimeZone,
                startsAt: newStartsAt,
                endsAt: newEndsAt,
                startDate: editStartDate,
                startTime: editStartTime,
                endDate: editEndDate,
                endTime: editEndTime,
              },
              onsite: {
                ...(storedJobs[idx].onsite || {}),
                venue: editVenue,
                address: editAddress,
                building: editBuilding,
                contact: editContact,
                contactMethod: editContactMethod,
              }
            };
            localStorage.setItem('terpdesk_interpreter_jobs', JSON.stringify(storedJobs));
          }
        } catch (e) {
          console.error(e);
        }
      }

      setIsEditAccessOpen(false);
    } catch (err: any) {
      console.error(err);
      setSaveError(err.message || 'Failed to update details. Please try again.');
    } finally {
      setIsSavingAccess(false);
    }
  };

  const [showRemoveBookingModal, setShowRemoveBookingModal] = useState(false);
  const [removeBookingTarget, setRemoveBookingTarget] = useState<{
    positionIndex: 1 | 2;
    offerId?: string;
    interpreterName: string;
  } | null>(null);
  const [isRemovingBooking, setIsRemovingBooking] = useState(false);
  const [removeBookingError, setRemoveBookingError] = useState<string | null>(null);
  const router = useRouter();

  const handleOpenRemoveBookingModal = (positionIndex: 1 | 2, offerId?: string, interpreterName?: string) => {
    setRemoveBookingError(null);
    setRemoveBookingTarget({
      positionIndex,
      offerId,
      interpreterName: interpreterName || `Position ${positionIndex} interpreter`
    });
    setShowRemoveBookingModal(true);
  };

  const handleConfirmRemoveBooking = async () => {
    if (!removeBookingTarget) return;
    setIsRemovingBooking(true);
    setRemoveBookingError(null);
    try {
      await removeBooking(id, removeBookingTarget.offerId, removeBookingTarget.positionIndex);

      localStorage.removeItem(`agency_staffing_state_${id}`);
      if (typeof window !== 'undefined') {
        try {
          const storedJobs = JSON.parse(localStorage.getItem('terpdesk_interpreter_jobs') || '[]');
          const updatedJobs = storedJobs.filter((j: any) => {
            const matchesId = String(j.id) === String(id) || String(j.requestId) === String(id);
            if (!matchesId) return true;
            if (j.positionIndex === removeBookingTarget.positionIndex) return false;
            if (totalPositions === 1) return false;
            return true;
          });
          localStorage.setItem('terpdesk_interpreter_jobs', JSON.stringify(updatedJobs));
        } catch (e) {
          console.error(e);
        }
      }

      // Close the modal right away, then invalidate and refetch so the UI reflects the DB
      setShowRemoveBookingModal(false);
      setRemoveBookingTarget(null);
      const updated = await fetchLiveRequestById(id);
      setFoundRequest(updated);
      router.refresh();
    } catch (err) {
      console.error(err);
      setRemoveBookingError(err instanceof Error ? err.message : 'Failed to remove the booking. Please try again.');
    } finally {
      setIsRemovingBooking(false);
    }
  };



 

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
    if (!foundRequest || dbInterpreters.length === 0) {
      setInterpreterFitMap({});
      setIsInterpreterFitLoading(false);
      setInterpreterFitError(null);
      return;
    }

    let isCurrent = true;
    const loadInterpreterFits = async () => {
      setIsInterpreterFitLoading(true);
      setInterpreterFitError(null);

      const jobTimeZone =
        foundRequest.details?.timeZone ||
        foundRequest.details?.timezone ||
        foundRequest.timeZone ||
        foundRequest.data?.details?.timeZone ||
        foundRequest.data?.timeZone;
      const interpreterIds = dbInterpreters.map((interpreter: any) => String(interpreter.id));

      try {
        const jobStart = new Date(foundRequest.startsAt);
        const jobEnd = new Date(foundRequest.endsAt);
        if (Number.isNaN(jobStart.getTime()) || Number.isNaN(jobEnd.getTime())) {
          throw new Error("This request is missing a valid start or end time.");
        }

        const fits = await getInterpretersFitForJob({
          interpreterIds,
          agencyId: currentUser?.agency_id || 'agency-1',
          jobStartsAtUtc: jobStart.toISOString(),
          jobEndsAtUtc: jobEnd.toISOString(),
          jobTimeZone,
        });
        if (!fits || typeof fits !== "object") {
          throw new Error("The availability service returned no interpreter statuses.");
        }
        if (isCurrent) setInterpreterFitMap(fits);
      } catch (error) {
        console.error(error);
        if (isCurrent) {
          setInterpreterFitMap({});
          setInterpreterFitError(getErrorMessage(error));
        }
      } finally {
        if (isCurrent) setIsInterpreterFitLoading(false);
      }
    };

    void loadInterpreterFits();
    return () => {
      isCurrent = false;
    };
  }, [foundRequest, dbInterpreters, currentUser?.agency_id]);


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
     await cancelRequest(id, cancelReasonInput.trim(), clientRequested);
     const updatedRequest = await fetchLiveRequestById(id);
     setFoundRequest(updatedRequest);
     setShowCancelModal(false);
   } catch (err) {
     console.error(err);
   }
 };

  const handleAutoBook = async (posIdx: 1 | 2 = 1) => {
    const selectedId = posIdx === 1 ? autoBookRecipient1 : autoBookRecipient2;
    const currentRoster = posIdx === 1 ? rosterSlot1 : rosterSlot2;
    const selectedName = currentRoster.find(i => i.id === selectedId)?.name || 'Unknown Interpreter';

    try {
      const result = await assignInterpreter(id, selectedId, selectedName, posIdx);
      if (typeof result.error === 'string') {
        const blockedMessage = result.error;
        // Blocked on the server (interpreter has not opted in): nothing was booked, so stop here.
        setAutoBookErrors(prev => ({ ...prev, [posIdx]: blockedMessage }));
        return;
      }
      setAutoBookErrors(prev => ({ ...prev, [posIdx]: '' }));
      const updatedRequest = await fetchLiveRequestById(id);
      setFoundRequest(updatedRequest);
      if (posIdx === 1) setAutoBookRecipient1('');
      if (posIdx === 2) setAutoBookRecipient2('');
    } catch (err) {
      console.error(err);
    }

    if (typeof window !== 'undefined') {
      try {
        const storedJobs = JSON.parse(localStorage.getItem('terpdesk_interpreter_jobs') || '[]');
        const jobIndex = storedJobs.findIndex((job: any) => 
          (String(job.id) === String(id) || String(job.requestId) === String(id)) && 
          (job.positionIndex === posIdx || (!job.positionIndex && posIdx === 1))
        );
        
        const payload = {
          ...(foundRequest || {}),
          id: `${id}-pos-${posIdx}`,
          requestId: id,
          status: 'booked',
          interpreterName: selectedName,
          positionIndex: posIdx,
          location: getPayloadLocation(),
          serviceRecordState: 'not_started'
        };

        if (jobIndex > -1) {
          storedJobs[jobIndex] = { ...storedJobs[jobIndex], ...payload };
        } else {
          storedJobs.push(payload);
        }
        
        localStorage.setItem('terpdesk_interpreter_jobs', JSON.stringify(storedJobs));
      } catch (e) {
        console.error(e);
      }
    }
    
    updateRequest(id, { status: totalPositions === 2 && staffedCount === 0 ? 'Partially staffed' : 'booked' });
  };

  const handleCreateOffer = async (posIdx: 1 | 2 = 1) => {
    const rec = posIdx === 1 ? recipient1 : recipient2;
    const expDate = posIdx === 1 ? expiryDate1 : expiryDate2;
    const expTime = posIdx === 1 ? expiryTime1 : expiryTime2;
    const setErr = posIdx === 1 ? setErrorMessage1 : setErrorMessage2;
    const setSuccess = posIdx === 1 ? setSuccessMessage1 : setSuccessMessage2;
    const setRec = posIdx === 1 ? setRecipient1 : setRecipient2;
    const setIsSending = posIdx === 1 ? setIsSendingOffer1 : setIsSendingOffer2;

    setErr('');
    setSuccess('');

    if (!rec || !expDate || !expTime) {
      setErr('Please select an interpreter and set a valid future expiry date/time before the appointment starts.');
      return;
    }
    
    const jobTimeZone = mapSafeZone(foundRequest?.details?.timeZone);
    const inputValue = `${expDate}T${expTime}`;
    const expiryUtc = new Date(fromZonedTime(inputValue, jobTimeZone).toISOString());
    const startUtc = parseSafeDate(foundRequest?.startsAt) || new Date();

    if (expiryUtc <= new Date() || expiryUtc >= startUtc) {
      setErr('Expiry must be in the future and before appointment start.');
      return;
    }

    const selectedInterpreter = dbInterpreters.find((i: any) => i.id === rec);
    const interpreterEmail = selectedInterpreter?.email;

    if (!interpreterEmail) {
      setErr('Unable to find an email address for the selected interpreter.');
      return;
    }

    setIsSending(true);

    try {
      // 1. Create the offer in the database (refused for past jobs and bad deadlines, with a readable reason)
      const created = await createOffer({
        requestId: id,
        interpreterId: rec,
        expiresAt: expiryUtc,
        positionIndex: posIdx
      });
      if (!created.success) throw new Error(created.error);

      // 2. Dispatch offer email with magic link
      const dispatchRes = await fetch('/api/offers/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          interpreterId: rec,
          requestId: id,
          interpreterEmail,
          positionNumber: posIdx,
        }),
      });

      const dispatchData = await dispatchRes.json();

      if (!dispatchRes.ok || !dispatchData.success) {
        throw new Error(dispatchData.error || 'Failed to dispatch offer email');
      }

      // 3. Refetch the request to get updated offers list
      const updatedRequest = await fetchLiveRequestById(id);
      setFoundRequest(updatedRequest);
      
      setErr('');
      setSuccess('Offer emailed successfully');
      showToast('Offer emailed successfully');
      setRec('');
    } catch (error) {
      console.error('[Offer Dispatch] Error creating or sending offer:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to create offer. Please try again.';
      setErr(errorMsg);
    } finally {
      setIsSending(false);
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

 const isRepeating = Boolean(
   foundRequest?.repeats ||
   foundRequest?.details?.repeats ||
   foundRequest?.data?.repeats ||
   foundRequest?.data?.details?.repeats
 );
 const recurrenceNote = (
   foundRequest?.recurrenceNote ||
   foundRequest?.details?.recurrenceNote ||
   foundRequest?.data?.recurrenceNote ||
   foundRequest?.data?.details?.recurrenceNote ||
   ""
 ).trim();
 const recurrenceDisplay = isRepeating
   ? (recurrenceNote || "Yes — see staff follow-up")
   : null;

 const assignment = {
 ...foundRequest,
 overview: {
 location: foundRequest.location || foundRequest.overview?.location || (foundRequest.isVirtual ? (foundRequest.platform ? `${foundRequest.platform} (Virtual)` : "Virtual") : (foundRequest.onsite?.venue || "Location pending")),
 reference: formatReference(foundRequest.id),
 status: isCancelled ? "Cancelled" : (foundRequest.status || "Unfilled"),
 ...(isRepeating ? { repeats: recurrenceDisplay } : {})
 },
 details: foundRequest.details || { setting: foundRequest.setting || "Medical", purpose: "Routine checkup", format: foundRequest.format || "In person", timeZone: "Pacific Time — Seattle, Los Angeles", deafParticipant: "1", peopleNeeding: "1", commPreferences: "ASL", qualifications: "Medical certified" },
 onsite: foundRequest.onsite || { venue: foundRequest.location || "Location pending", address: "", building: "", parking: "", entrance: "", contact: "", contactMethod: "" },
 requester: foundRequest.requester || { name: "Ralph Chrysler Silva", org: "Freshflow", email: "ralphchryslersilva65@gmail.com", phone: "09218648143", prefContact: "Text message", reqInterpreter: "No preference", teamSuggested: "Team suggested", billOrg: "Organization on file", billContact: "Billing Dept", billEmail: "ralphchryslersilva65@gmail.com", poNumber: "PO-9921" },
 prepNotes: foundRequest.prepNotes || "Please arrive 15 minutes early.",
 privateNotes: foundRequest.privateNotes || "Client requested experienced medical terp.",
 activity: foundRequest.activity || "created · Avery North · Mon, Sep 28 · 3:37 AM GMT+8"
 };

 const cardClass = "bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 border border-gray-200/50 shadow-none space-y-4";
 const isOdhhRequest = foundRequest?.data?.intake?.program === 'WA ODHH' || foundRequest?.data?.intake?.program === 'wa_odhh' || foundRequest?.program === 'WA ODHH' || foundRequest?.program === 'wa_odhh';
 // Client shown in the banner: the saved client name when there is one, otherwise the requester's organization.
 const rawClientName = String(foundRequest?.client ?? foundRequest?.data?.client ?? foundRequest?.requester?.org ?? '').trim();
 const bannerClientName = rawClientName && !rawClientName.startsWith('New or one-time') ? rawClientName : '';
 const matchedClient = clientsOnFile.find((c) => c.name.trim().toLowerCase() === bannerClientName.toLowerCase());
 // State-program requests are always shown as state assignments; otherwise the client's own type decides.
 const bannerClientType = isOdhhRequest ? 'state_agency' : normalizeClientType(matchedClient?.type);
 const programLabel = isOdhhRequest ? 'WA ODHH (State Agency)' : 'Private Hospital / Standard Agency';

 // Requester card: only these fields, and only when something was actually provided.
 const textOf = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
 const requesterInfo = (assignment.requester || {}) as Record<string, unknown>;
 const requesterRows: { label: string; value: string }[] = [
   { label: 'Organization', value: textOf(requesterInfo.org) },
   { label: 'Name', value: textOf(requesterInfo.name) },
   { label: 'Email', value: textOf(requesterInfo.email) },
   { label: 'Phone', value: textOf(requesterInfo.phone) },
   {
     label: 'Team suggested',
     value: requesterInfo.teamSuggested === true ? 'Yes' : (textOf(requesterInfo.teamSuggested).toLowerCase() === 'no' ? '' : textOf(requesterInfo.teamSuggested)),
   },
 ].filter((row) => row.value !== '');

 const inputClass = "w-full bg-[#F4F3EF] border-none rounded-full px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow";

 const { startsAt: reqStartsAt, endsAt: reqEndsAt } = resolveRequestTimes({
   createdAt: foundRequest?.createdAt,
   data: foundRequest?.data || foundRequest
 });
 const startsAtUtcMs = new Date(reqStartsAt).getTime();
 const endsAtUtcMs = new Date(reqEndsAt).getTime();

 const isFutureAppointment = currentTime < startsAtUtcMs;
 const isAppointmentInProgress = currentTime >= startsAtUtcMs && currentTime <= endsAtUtcMs;
 const isAppointmentPassed = currentTime > endsAtUtcMs;
 const isHappening = isAppointmentInProgress || isAppointmentHappeningNow(assignment, currentTime);

 // Future appointments (currentTime < startsAtUtcMs) are NEVER locked.
 // Remove booking remains unlocked for future appointments even if test hours were logged during earlier bypass testing.
 const isBookingLocked = !isFutureAppointment && (isAppointmentInProgress || isAppointmentPassed);

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
 <div className="flex flex-wrap items-center gap-2 mt-1">
   <p className="text-[var(--sage)]">{formatDetailsDate(assignment.startsAt, assignment.endsAt, assignment.details?.timeZone || assignment.timeZone)}</p>
   {isRepeating && (
     <span className="inline-flex items-center text-xs font-medium text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
       Repeats: {recurrenceDisplay}
     </span>
   )}
 </div>
 </div>
 <div className="flex flex-wrap items-center gap-3">
 {isAppointmentHappeningNow(assignment, currentTime) && (
   <HappeningNowBadge />
 )}
 {!isCancelled && isUnfilledPastDue(assignment, currentTime) && (
   <span className="inline-flex items-center bg-red-50 text-red-700 border border-red-200 text-[13px] font-semibold px-3 py-1 rounded-full">
     Unfilled - Past Due
   </span>
 )}
 {/* Scheduled end has passed and someone was booked: the job is done. */}
 {!isCancelled && isAppointmentPassed && hasAcceptedBooking && (
   <span className="inline-flex items-center bg-gray-100 text-gray-700 border border-gray-200 text-[13px] font-semibold px-3 py-1 rounded-full">
     Completed
   </span>
 )}
 {isCancelled && (
 <span className="bg-[#FEF2F2] text-[#991B1B] text-[13px] font-medium px-3 py-1 rounded-full border border-[#FCA5A5]/30">Cancelled</span>
 )}
 <button className="rounded-full px-5 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 transition-colors">
 View in calendar
 </button>
 {!isCancelled && (
 isEditLocked ? (
 <button
 disabled
 title={editLockMessage}
 className="rounded-full px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed inline-flex items-center gap-1.5"
 >
 <Lock className="w-3.5 h-3.5 text-gray-400" />
 <span>Quick edit</span>
 </button>
 ) : (
 <button
 onClick={openEditAccessModal}
 className="rounded-full px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 transition-colors inline-flex items-center gap-1.5"
 >
 <Edit2 className="w-3.5 h-3.5 text-gray-500" />
 <span>Quick edit</span>
 </button>
 )
 )}
 {!isCancelled && (
 isEditLocked ? (
 <button
 disabled
 title={editLockMessage}
 className="rounded-full px-5 py-2 text-sm font-medium text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed inline-flex items-center gap-1.5"
 >
 <Lock className="w-3.5 h-3.5 text-gray-400" />
 <span>Edit assignment</span>
 </button>
 ) : (
 <Link href={`/requests/${params.id}/edit`} className="rounded-full px-5 py-2 text-sm font-medium text-white bg-[var(--forest)] hover:bg-[var(--forest)]/90 transition-colors">
 Edit assignment
 </Link>
 )
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

 {isEditLocked && !isCancelled && (
 <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl px-5 py-3.5 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
 <div className="flex items-center gap-2.5">
 <Lock className="w-4 h-4 text-amber-700 shrink-0" />
 <span>{editLockMessage}</span>
 </div>
 </div>
 )}
 {!isEditLocked && hasAcceptedBooking && !isCancelled && (
 <div className="bg-sky-50 border border-sky-200 rounded-2xl px-5 py-3.5 text-sm text-sky-900 mb-6">
 An interpreter is booked. The date, time, time zone and program are locked, but you can still edit the location, contacts, notes and credentials. When you save, each booked interpreter is emailed exactly what changed (plus an optional message from you), and the job is marked “Updated” in their app.
 </div>
 )}
 {editNotice && (
 <div role="status" className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3.5 text-sm text-emerald-900 mb-6 flex items-start justify-between gap-3">
 <span>{editNotice}</span>
 <button type="button" onClick={() => setEditNotice(null)} className="text-emerald-700 hover:text-emerald-900" aria-label="Dismiss"><X className="w-4 h-4" /></button>
 </div>
 )}

 {/* Questions from interpreters: first, so staff see them immediately. */}
 <ClarificationsCard clarifications={foundRequest?.data?.clarifications} />

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
 })() : ''}. Every position was released and any pending offer was closed. {(foundRequest?.clientRequestedCancellation || clientRequested) && "The client requested cancellation. "}The record is kept; the scheduled times are unchanged.
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
 <DataRow label="Request source" value={programLabel} />
 <DataRow label="Location" value={assignment.overview.location} />
 <DataRow label="Reference" value={assignment.overview.reference} />
 <DataRow label="Status" value={assignment.overview.status} />
 {assignment.overview.repeats && <DataRow label="Repeats" value={String(assignment.overview.repeats)} />}
 </div>

 <ClientAssignmentBanner clientType={bannerClientType} clientName={bannerClientName} />
 </div>

  {(() => {
    const isVirtualAppointment = Boolean(
      assignment.isVirtual ||
      assignment.format?.toLowerCase().includes('virtual') ||
      assignment.details?.format?.toLowerCase().includes('virtual')
    );

    const currentMeetingLink = assignment.meetingLink || assignment.virtualLink || assignment.details?.meetingLink || assignment.details?.virtualLink || null;
    const currentMeetingId = assignment.meetingId || assignment.details?.meetingId || null;
    const currentPasscode = assignment.passcode || assignment.accessCode || assignment.details?.passcode || assignment.details?.accessCode || null;
    const currentPlatform = assignment.platform || assignment.details?.platform || (currentMeetingLink?.includes('zoom') ? 'Zoom' : 'Virtual');
    const currentVirtualInstructions = assignment.virtualInstructions || assignment.details?.virtualInstructions || null;

    return (
      <>
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[18px] font-medium text-[var(--ink)]">Assignment details</h2>
            <button
              onClick={openEditAccessModal}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5 text-gray-500" />
              Edit setting & format
            </button>
          </div>
          <div className="flex flex-col">
            <DataRow label="Program type" value={programLabel} />
            <DataRow
              label="Format"
              value={isVirtualAppointment ? 'Virtual' : (textOf(assignment.details?.format) || textOf(foundRequest?.format) || 'In person')}
            />
            <DataRow
              label="Time zone"
              value={textOf(assignment.details?.timeZone) || textOf(foundRequest?.timeZone) || 'Pacific Time — Seattle, Los Angeles'}
            />
            <DataRow
              label="Setting"
              value={textOf(assignment.details?.setting) || textOf(foundRequest?.setting) || 'Medical'}
            />
          </div>
        </div>

        {isVirtualAppointment ? (
          <div className={cardClass}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-[var(--forest)]" />
                <h2 className="text-[18px] font-medium text-[var(--ink)]">Virtual meeting details</h2>
              </div>
              <button
                onClick={openEditAccessModal}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                Edit virtual details
              </button>
            </div>

            <div className="space-y-4 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 gap-3">
                <div>
                  <span className="text-xs text-gray-500 block">Platform & Join URL</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-semibold text-sm text-[var(--ink)]">
                      {currentPlatform}
                    </span>
                    {currentMeetingLink ? (
                      <span className="text-xs text-gray-500 truncate max-w-[280px]">
                        {currentMeetingLink}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                        Virtual link pending
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {currentMeetingLink && (
                    <>
                      <CopyButton text={currentMeetingLink} label="meeting link" />
                      <a
                        href={currentMeetingLink.startsWith('http') ? currentMeetingLink : `https://${currentMeetingLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium bg-[var(--forest)] text-white px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity"
                      >
                        <span>Open link</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-500 block">Meeting ID</span>
                    <span className="font-semibold text-sm text-[var(--ink)] mt-0.5 block">
                      {currentMeetingId || 'None'}
                    </span>
                  </div>
                  {currentMeetingId && (
                    <CopyButton text={currentMeetingId} label="meeting ID" />
                  )}
                </div>

                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-500 block">Passcode / Access code</span>
                    <span className="font-semibold text-sm text-[var(--ink)] mt-0.5 block font-mono">
                      {currentPasscode || 'None'}
                    </span>
                  </div>
                  {currentPasscode && (
                    <CopyButton text={currentPasscode} label="passcode" />
                  )}
                </div>
              </div>

              {currentVirtualInstructions && (
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Virtual instructions & notes</span>
                    <CopyButton text={currentVirtualInstructions} label="virtual instructions" />
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">
                    {currentVirtualInstructions}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={cardClass}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[var(--forest)]" />
                <h2 className="text-[18px] font-medium text-[var(--ink)]">On-site details</h2>
              </div>
              <button
                onClick={openEditAccessModal}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                Edit location details
              </button>
            </div>
            <div className="flex flex-col">
              <div className="flex justify-between items-center border-b border-gray-50 py-3">
                <span className="text-[var(--sage)] text-sm">Venue</span>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--ink)] text-sm font-medium">{assignment.onsite?.venue || 'Location pending'}</span>
                  {assignment.onsite?.venue && <CopyButton text={assignment.onsite.venue} label="venue" />}
                </div>
              </div>
              <div className="flex justify-between items-center border-b border-gray-50 py-3">
                <span className="text-[var(--sage)] text-sm">Address</span>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--ink)] text-sm font-medium">{assignment.onsite?.address || 'Not provided'}</span>
                  {assignment.onsite?.address && <CopyButton text={assignment.onsite.address} label="address" />}
                </div>
              </div>
              {assignment.onsite?.building && (
                <DataRow label="Building / Room" value={assignment.onsite.building} />
              )}
              {assignment.onsite?.parking && (
                <DataRow label="Parking" value={assignment.onsite.parking} />
              )}
              {assignment.onsite?.entrance && (
                <DataRow label="Entrance" value={assignment.onsite.entrance} />
              )}
              {assignment.onsite?.contact && (
                <DataRow label="On-site contact" value={assignment.onsite.contact} />
              )}
              {assignment.onsite?.contactMethod && (
                <DataRow label="Contact method" value={assignment.onsite.contactMethod} />
              )}
            </div>
          </div>
        )}
      </>
    );
  })()}

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
 {requesterRows.length === 0 ? (
 <p className="text-sm text-gray-500 py-2">No requester details were provided.</p>
 ) : (
 requesterRows.map((row) => <DataRow key={row.label} label={row.label} value={row.value} />)
 )}
 </div>
 <p className="text-xs text-gray-400 mt-4">
 Staff only. A requested interpreter is a preference, not a booking.
 </p>
 </div>

 {/* Interactive / Staffing */}
 
 <PrepMaterialsSection requestId={id} cardClass={cardClass} />

 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Service verification</h2>
 <label className="flex items-start gap-3 cursor-pointer mt-2">
 <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]" />
 <span className="text-sm text-gray-800 leading-snug">Ask each interpreter for a service-verification signature</span>
 </label>
 </div>

 {(() => {
   const isOdhh = foundRequest?.data?.intake?.program === 'WA ODHH' || foundRequest?.data?.intake?.program === 'wa_odhh' || foundRequest?.program === 'WA ODHH' || foundRequest?.program === 'wa_odhh';
   const hoursMap = (foundRequest?.hoursSubmissions || foundRequest?.data?.hoursSubmissions || {}) as Record<number, any>;
   // Legacy single-position field = Position 1 only (a copy marked Position 2 is ignored).
   const legacyHours = legacyPosition1Hours(foundRequest?.data) || legacyPosition1Hours(foundRequest);
   if (!hoursMap[1] && legacyHours) {
     hoursMap[1] = legacyHours;
   }

   const positionsWithHours = ([1, 2] as const).filter(pos => {
     if (totalPositions === 1 && pos === 2) return false;
     return Boolean(hoursMap[pos] || (pos === 1 && (foundRequest?.travelStartTime || ['awaiting_review', 'correction_requested', 'approved'].includes(foundRequest?.status))));
   });

   if (positionsWithHours.length === 0) return null;

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

   return (
     <div className={cardClass}>
       <div className="flex justify-between items-center mb-4">
         <div>
           <h2 className="text-[18px] font-medium text-[var(--ink)]">Reported service hours</h2>
           <p className="text-xs text-[var(--sage)] mt-0.5">
             {totalPositions === 2 ? 'Tracked and reviewed per interpreter position' : 'Actual service time submitted by interpreter'}
           </p>
         </div>
         <Link href="/hours-review" className="text-xs font-semibold text-[var(--forest)] hover:underline inline-flex items-center gap-1">
           Open in Hours Review queue →
         </Link>
       </div>

        {isFutureAppointment && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3.5 text-xs flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>This appointment has not occurred yet (scheduled in the future). Hours submitted prior to appointment start are test entries or pending verification once service begins.</span>
          </div>
        )}

       <div className="space-y-6">
         {positionsWithHours.map(posIdx => {
           const hoursSub = hoursMap[posIdx] || null;
           const posAccepted = posIdx === 1 ? slot1Accepted : slot2Accepted;
           const posInterpreterName = posAccepted?.interpreterName || hoursSub?.interpreterName || (posIdx === 1 ? 'Position 1 interpreter' : 'Position 2 interpreter');
           
           const actualStart = hoursSub?.actualStartTime || foundRequest?.startsAt;
           const actualEnd = hoursSub?.actualEndTime || foundRequest?.endsAt;

           const posStatus = hoursSub?.status || foundRequest?.status || 'awaiting_review';
           const statusBadge = posStatus === 'approved' 
             ? { label: 'Approved', bg: 'bg-green-100 text-green-700' }
             : posStatus === 'correction_requested' 
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

           const travelStr = isOdhh && (hoursSub?.travelStartTime || (posIdx === 1 && foundRequest.travelStartTime))
             ? formatRange(hoursSub?.travelStartTime || (posIdx === 1 ? foundRequest.travelStartTime : null), hoursSub?.travelEndTime || (posIdx === 1 ? foundRequest.travelEndTime : null))
             : 'None reported';

           const actualStr = formatRange(actualStart, actualEnd);

           return (
             <div key={posIdx} className="p-5 bg-gray-50/70 rounded-xl border border-gray-200/80 space-y-4">
               <div className="flex items-center justify-between pb-3 border-b border-gray-200/60">
                 <div className="flex items-center gap-2">
                   <span className="font-semibold text-sm text-[var(--ink)]">Position {posIdx} · {posInterpreterName}</span>
                 </div>
                 <span className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full ${statusBadge.bg}`}>
                   {statusBadge.label}
                 </span>
               </div>

               {isFutureAppointment && (
                 <div className="bg-amber-50/70 border border-amber-200/70 text-amber-800 text-xs rounded-lg p-2.5 flex items-center gap-2">
                   <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                   <span>Appointment scheduled for the future — service has not occurred yet.</span>
                 </div>
               )}

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                 <div className="space-y-4">
                   <div>
                     <div className="text-[var(--sage)] mb-1">Scheduled booking</div>
                     <div className="text-[var(--ink)] font-medium">
                       {formatRange(reqStartsAt, reqEndsAt)}
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
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm border-t border-gray-200/60 pt-3">
                   {hoursSub.mileageNote && (
                     <div>
                       <div className="text-[var(--sage)] text-xs mb-1 flex items-center justify-between">
                         <span>Mileage note</span>
                         <CopyButton text={hoursSub.mileageNote} label="mileage note" />
                       </div>
                       <div className="text-[var(--ink)] text-xs bg-white p-2.5 rounded-lg border border-gray-200/60">
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
                       <div className="text-[var(--ink)] text-xs bg-white p-2.5 rounded-lg border border-gray-200/60">
                         {hoursSub.note}
                       </div>
                     </div>
                   )}
                 </div>
               )}
             </div>
           );
         })}
       </div>
     </div>
   );
 })()}

 {!isCancelled && (
 <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 border border-gray-200/50 shadow-none mb-4">
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-4">Staffing</h2>
 <p className="text-sm text-[var(--sage)] mb-1">Pending offers do not reserve time.</p>
 <p className="text-sm text-[var(--sage)] mb-6">Back-to-back appointments are allowed. Travel time is not checked.</p>
 
  <div className="space-y-6">
    {([1, 2].slice(0, totalPositions) as (1 | 2)[]).map((posIdx) => {
      const isSlot1 = posIdx === 1;
      const accepted = isSlot1 ? slot1Accepted : slot2Accepted;
      const activeOffer = isSlot1 ? slot1ActiveOffer : slot2ActiveOffer;
      const pastOffers = isSlot1 ? slot1PastOffers : slot2PastOffers;
      const needsReplacement = isSlot1 ? slot1NeedsReplacement : slot2NeedsReplacement;
      const roster = isSlot1 ? rosterSlot1 : rosterSlot2;
      const rec = isSlot1 ? recipient1 : recipient2;
      const setRec = (val: string) => {
        if (isSlot1) {
          setRecipient1(val);
          if (val && recipient2 === val) setRecipient2('');
          if (val && autoBookRecipient2 === val) setAutoBookRecipient2('');
        } else {
          setRecipient2(val);
          if (val && recipient1 === val) setRecipient1('');
          if (val && autoBookRecipient1 === val) setAutoBookRecipient1('');
        }
      };

      const autoBookRec = isSlot1 ? autoBookRecipient1 : autoBookRecipient2;
      const setAutoBookRec = (val: string) => {
        if (isSlot1) {
          setAutoBookRecipient1(val);
          if (val && autoBookRecipient2 === val) setAutoBookRecipient2('');
          if (val && recipient2 === val) setRecipient2('');
        } else {
          setAutoBookRecipient2(val);
          if (val && autoBookRecipient1 === val) setAutoBookRecipient1('');
          if (val && recipient1 === val) setRecipient1('');
        }
      };
      const expDate = isSlot1 ? expiryDate1 : expiryDate2;
      const setExpDate = isSlot1 ? setExpiryDate1 : setExpiryDate2;
      const expTime = isSlot1 ? expiryTime1 : expiryTime2;
      const setExpTime = isSlot1 ? setExpiryTime1 : setExpiryTime2;
      const errMsg = isSlot1 ? errorMessage1 : errorMessage2;
      const setErrMsg = isSlot1 ? setErrorMessage1 : setErrorMessage2;
      const successMsg = isSlot1 ? successMessage1 : successMessage2;
      const isSending = isSlot1 ? isSendingOffer1 : isSendingOffer2;
      const isElig = isSlot1 ? isEligible1 : isEligible2;
      // Not granted (or still loading) means no auto-book; sending an offer is always still possible.
      const autoBookDenied = Boolean(autoBookRec) && autoBookAllowed[autoBookRec] !== true;
      const setIsElig = isSlot1 ? setIsEligible1 : setIsEligible2;

      let slotBadgeColor = 'bg-[#FEF3C7] text-[#92400E]';
      let slotBadgeText = 'Booking: Unfilled';
      if (accepted) {
        slotBadgeColor = 'bg-green-100 text-green-700';
        slotBadgeText = 'Booking: Filled';
      } else if (activeOffer) {
        slotBadgeColor = 'bg-blue-100 text-blue-700';
        slotBadgeText = 'Booking: Offer awaiting response';
      } else if (needsReplacement) {
        slotBadgeColor = 'bg-[#FDE8E8] text-[#9B1C1C]';
        slotBadgeText = 'Booking: Needs replacement';
      }

      return (
        <div 
          key={posIdx} 
          className={totalPositions === 2 ? 'p-5 sm:p-6 rounded-2xl border border-gray-200/80 bg-[#FAFAF8]' : ''}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-[var(--ink)] text-base">Position {posIdx} · interpreter</h3>
            {totalPositions === 2 && (
              <span className="text-xs text-[var(--sage)] font-medium">Position {posIdx} of 2</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <span className={`px-3 py-1 text-[12px] font-medium rounded-full ${slotBadgeColor}`}>
              {slotBadgeText}
            </span>
            <span className="px-3 py-1 bg-white border border-gray-200 text-gray-600 text-[12px] font-medium rounded-full">
              Access: Available
            </span>
          </div>

          <p className="text-sm text-gray-700 mt-3 mb-4">
            Assigned interpreter: <span className="text-[var(--sage)]">{accepted ? accepted.interpreterName : 'Unfilled'}</span>
          </p>

          {!accepted ? (
            <>
              {!activeOffer && (
                <ExpiredOfferNotice
                  pastOffers={pastOffers}
                  appointmentFinished={isAppointmentFinished}
                  now={currentTime}
                  onOfferAgain={setRec}
                />
              )}

              {pastOffers.length > 0 && (
                <CollapsiblePreviousOffers
                  pastOffers={pastOffers}
                  isAppointmentFinished={isAppointmentFinished}
                  apptTz={foundRequest?.details?.timeZone || foundRequest?.timeZone}
                />
              )}

              {activeOffer ? (
                <div className="bg-[#F5F4F0] p-4 rounded-xl mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--ink)] font-medium">{activeOffer.interpreterName}</span>
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold capitalize">{activeOffer.state || activeOffer.status}</span>
                  </div>
                  <p className="text-sm text-[var(--sage)] mt-2 mb-4">
                    Response due {(() => {
                      try {
                        const d = parseSafeDate(activeOffer.expiresAt);
                        if (!d) return 'Unknown';
                        const apptTz = foundRequest?.details?.timeZone || foundRequest?.timeZone;
                        return formatInTimeZone(d, mapSafeZone(apptTz), 'MM/dd/yyyy h:mm:ss a');
                      } catch (e) {
                        return 'Unknown';
                      }
                    })()}
                  </p>
                  <button 
                    type="button"
                    onClick={async () => {
                      try {
                        await updateOfferStatus(activeOffer.id, 'withdrawn');
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
              ) : !isFutureAppointment ? (
                // Started or past: no new offers (the server refuses them too) until the time is edited forward.
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  <p className="flex items-center gap-2 font-medium text-[var(--ink)]">
                    <Lock className="h-4 w-4 text-gray-500" aria-hidden="true" />
                    {isAppointmentInProgress ? "This appointment is under way" : "This appointment's time has passed"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--sage)]">
                    New offers can&apos;t be sent for a job that has started or ended. To offer it again, edit the request
                    to a future date and time.
                  </p>
                </div>
              ) : (
                <>
                  <label className="flex items-start gap-3 cursor-pointer mb-6">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]" />
                    <span className="text-sm text-gray-700">Deliberately offer this slot to multiple interpreters</span>
                  </label>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm text-[var(--sage)]">Select one recipient</label>
                        {rec && <InterpreterFitBadge fit={interpreterFitMap[rec]} />}
                      </div>
                      <select 
                        className="w-full bg-[#F5F4F0] border-none rounded-full px-4 py-3 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow appearance-none"
                        value={rec}
                        onChange={(e) => setRec(e.target.value)}
                      >
                        <option value="">Choose an interpreter</option>
                        {roster.map((interpreter) => (
                          <option key={interpreter.id} value={interpreter.id}>
                            {getInterpreterOptionLabel(
                              interpreter.name,
                              interpreter.email,
                              interpreterFitMap[interpreter.id],
                              isInterpreterFitLoading,
                              Boolean(interpreterFitError),
                              pastOfferNote(pastOffers, interpreter.id, isAppointmentFinished, currentTime)
                            )}
                          </option>
                        ))}
                      </select>
                      {rec && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-[var(--sage)]" aria-live="polite">
                          <span>{roster.find((interpreter) => interpreter.id === rec)?.name}</span>
                          <InterpreterFitBadge fit={interpreterFitMap[rec]} />
                        </div>
                      )}
                      {rec && (
                        <FitWarningNotice fit={interpreterFitMap[rec]} />
                      )}
                      {interpreterFitError && (
                        <p className="mt-2 text-xs text-red-700" role="alert">
                          Unable to load interpreter availability: {interpreterFitError}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm text-[var(--sage)] mb-2">Offer expiry</label>
                      <div className="flex flex-col sm:flex-row gap-4 w-full">
                        <div className="flex-1 relative w-full">
                          <input 
                            type="date" 
                            className="w-full bg-[#F5F4F0] border-none rounded-full px-4 py-3 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow" 
                            value={expDate}
                            onChange={(e) => {
                              setExpDate(e.target.value);
                              setErrMsg('');
                              if (!expTime) {
                                setExpTime('09:00');
                              }
                            }}
                          />
                        </div>
                        <div className="flex-1 relative w-full">
                          <input 
                            type="time" 
                            className="w-full bg-[#F5F4F0] border-none rounded-full px-4 py-3 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow" 
                            value={expTime}
                            onChange={(e) => {
                              setExpTime(e.target.value);
                              setErrMsg('');
                            }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-[var(--sage)] mt-2 mb-2">Choose a future expiration before the appointment starts. An offer email with a secure zero-login magic link will be dispatched to the interpreter.</p>
                      {errMsg && <p className="text-[#C23B22] text-sm mb-4">{errMsg}</p>}
                      {successMsg && (
                        <p className="text-[#059669] text-sm mb-4 font-medium flex items-center gap-1.5">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          {successMsg}
                        </p>
                      )}
                    </div>

                    <button 
                      type="button"
                      onClick={() => handleCreateOffer(posIdx)}
                      disabled={!rec || isSending}
                      className={`rounded-full px-6 py-2 text-sm font-medium transition-colors mt-2 w-auto flex items-center gap-2 ${
                        !rec || isSending
                          ? 'bg-[#8BA49E] text-white opacity-50 cursor-not-allowed' 
                          : 'bg-[#145347] text-white hover:bg-[#0f4037] cursor-pointer'
                      }`}
                    >
                      {isSending ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                          </svg>
                          <span>Sending offer...</span>
                        </>
                      ) : (
                        'Create offer'
                      )}
                    </button>
                  </div>

                  {/* Auto-book Section */}
                  <div className="bg-[#F5F4F0] p-4 md:p-5 rounded-xl mt-6">
                    <h4 className="font-semibold text-sm text-[var(--ink)] mb-1">Auto-book with the interpreter&apos;s permission</h4>
                    <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                      Books without waiting for an acceptance, and only for interpreters who have given your agency that permission. Virtual appointments only for now — travel time is not checked. Qualifications and rates are not checked either.
                    </p>
                    
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm text-[var(--sage)]">Interpreter</label>
                          {autoBookRec && (
                            <InterpreterFitBadge fit={interpreterFitMap[autoBookRec]} />
                          )}
                        </div>
                        <select 
                          className="w-full bg-white border border-gray-200 rounded-full px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow appearance-none"
                          value={autoBookRec}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAutoBookRec(val);
                            if (val) {
                              const interpreter = roster.find(i => i.id === val);
                              setIsElig(interpreter?.isAutoFillEligible ?? null);
                            } else {
                              setIsElig(null);
                            }
                          }}
                        >
                          <option value="">Choose an interpreter</option>
                          {roster.map((interpreter) => (
                            <option key={interpreter.id} value={interpreter.id}>
                              {getInterpreterOptionLabel(
                                interpreter.name,
                                interpreter.email,
                                interpreterFitMap[interpreter.id],
                                isInterpreterFitLoading,
                                Boolean(interpreterFitError),
                                pastOfferNote(pastOffers, interpreter.id, isAppointmentFinished, currentTime)
                              )}
                            </option>
                          ))}
                        </select>
                        {autoBookRec && (
                          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--sage)]" aria-live="polite">
                            <span>{roster.find((interpreter) => interpreter.id === autoBookRec)?.name}</span>
                            <InterpreterFitBadge fit={interpreterFitMap[autoBookRec]} />
                          </div>
                        )}
                        {autoBookRec && (
                          <FitWarningNotice fit={interpreterFitMap[autoBookRec]} />
                        )}
                        {interpreterFitError && (
                          <p className="mt-2 text-xs text-red-700" role="alert">
                            Unable to load interpreter availability: {interpreterFitError}
                          </p>
                        )}
                      </div>
                      {autoBookDenied ? (
                        <p className="text-[var(--sage)] text-sm mb-4">Not eligible for Auto Fill: This interpreter has not granted auto-book permission. You can still send an offer.</p>
                      ) : (
                        isElig === false && <p className="text-[var(--sage)] text-sm mb-4">Not eligible for Auto Fill: This interpreter is not sharing availability with your agency. You can still send an offer.</p>
                      )}
                      {autoBookErrors[posIdx] && <p role="alert" className="text-sm font-medium text-red-700 mb-4">{autoBookErrors[posIdx]}</p>}
                      <button 
                        type="button"
                        onClick={() => handleAutoBook(posIdx)}
                        disabled={!autoBookRec || isElig === false || autoBookDenied}
                        className={`rounded-full px-6 py-2 text-sm font-medium transition-colors w-full sm:w-auto ${
                          !autoBookRec || isElig === false || autoBookDenied
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
            <div className="space-y-4">
              <div className="bg-[#F5F4F0] p-4 rounded-xl">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--ink)] font-medium">{accepted.interpreterName}</span>
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-semibold capitalize">Assigned</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {(() => {
                      const assignedInterpId = String(
                        accepted.interpreterId ||
                        (isSlot1
                          ? (foundRequest?.slots?.find((s: any) => s.positionIndex === 1)?.reservedBy || foundRequest?.assignedInterpreterId || foundRequest?.data?.assignedInterpreterId)
                          : (foundRequest?.slots?.find((s: any) => s.positionIndex === 2)?.reservedBy || foundRequest?.position2InterpreterId || foundRequest?.data?.position2InterpreterId)) ||
                        dbInterpreters.find((i: any) => i.name === accepted.interpreterName)?.id ||
                        ''
                      );
                      const reqId = String(foundRequest?.id || id || '');
                      if (!assignedInterpId || !reqId) return null;
                      return (
                        <RequestTimesheetButton
                          requestId={reqId}
                          interpreterId={assignedInterpId}
                          assignmentId={String(accepted.id || '')}
                          startTime={reqStartsAt}
                          endTime={reqEndsAt}
                          timezone={foundRequest?.details?.timeZone || foundRequest?.timeZone}
                          timesheetDispatched={Boolean(timesheetFlags[assignedInterpId]?.dispatched)}
                          timesheetSubmitted={Boolean(timesheetFlags[assignedInterpId]?.submitted)}
                          timesheetApproved={Boolean(timesheetFlags[assignedInterpId]?.approved)}
                          isStateJob={isStateJobRequest({ isStateJob: foundRequest?.isStateJob, data: foundRequest?.data })}
                          className="mb-0"
                          onSuccess={(message) => {
                            showToast(message);
                            void loadTimesheetFlags(reqId);
                          }}
                        />
                      );
                    })()}
                    {/* Booked: staff can re-send the booking confirmation (with the secure details link). */}
                    {!isCancelled && <ResendDetailsButton requestId={id} positionIndex={posIdx} />}
                    {isBookingLocked ? (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-200/70 text-gray-600 text-xs font-medium">
                        <Lock className="w-3.5 h-3.5 text-gray-500" />
                        <span>{isAppointmentInProgress ? 'Locked · In progress' : 'Locked · Appointment passed'}</span>
                      </div>
                    ) : (
                      <button 
                        type="button"
                        onClick={() => handleOpenRemoveBookingModal(posIdx, accepted.id, accepted.interpreterName)}
                        className="text-[var(--sage)] hover:text-red-600 text-sm font-medium transition-colors"
                      >
                        Remove booking
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {pastOffers.length > 0 && (
                <CollapsiblePreviousOffers
                  pastOffers={pastOffers}
                  isAppointmentFinished={isAppointmentFinished}
                  apptTz={foundRequest?.details?.timeZone || foundRequest?.timeZone}
                />
              )}
            </div>
          )}
        </div>
      );
    })}
  </div>

 <div className="mt-6">
 <button
 type="button"
 onClick={openEditAccessModal}
 className="text-sm font-medium text-[var(--forest)] hover:underline transition-colors"
 >
 Manage access & virtual credentials →
 </button>
 </div>
 </div>
 )}

 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Agency-private notes</h2>
 <p className="text-gray-800 text-[15px] leading-relaxed">
 {assignment.privateNotes}
 </p>
 </div>

 <RequestActivityCard
 requestId={id}
 timeZone={getIanaZone(assignment.details?.timeZone || assignment.timeZone)}
 refreshKey={`${activityVersion}-${foundRequest?.status ?? ""}-${(foundRequest?.offers || []).length}`}
 cardClass={cardClass}
 />

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
 
 {(() => {
   const hasBookedInterpreter = Boolean(slot1Accepted || slot2Accepted);
   const startsSoonOrStarted = currentTime >= startsAtUtcMs || startsAtUtcMs - currentTime < 24 * 60 * 60 * 1000;
   if (!hasBookedInterpreter) {
     // STATE A: nobody booked
     return (
       <p className="text-[15px] text-gray-600 mb-6 leading-relaxed">
         This request is currently unfilled. Canceling will permanently close this draft.
       </p>
     );
   }
   if (startsSoonOrStarted) {
     // STATE C: booked, starting within 24 hours or already underway
     return (
       <p className="text-[15px] font-bold text-red-700 mb-6 leading-relaxed" role="alert">
         Warning: This assignment is starting soon or in progress. An interpreter is already booked. Canceling now may require a late-cancellation payout.
       </p>
     );
   }
   // STATE B: booked, more than 24 hours out
   return (
 <p className="text-[15px] text-gray-600 mb-6 leading-relaxed">
 Every position on this appointment will be cancelled. Booked interpreters lose the assignment and their reserved time is released, pending offers are closed, and nobody can accept or be auto-booked afterwards. Affected interpreters are told in the app. The appointment and its history are kept, not deleted, and the original scheduled times stay on record.
       </p>
     );
 })()}
 
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

  {isEditAccessOpen && (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-7 w-full max-w-[560px] mx-auto shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-gray-100">
          <div>
            <h3 className="text-xl font-semibold text-[var(--ink)]">Update Access & Location</h3>
            <p className="text-xs text-gray-500 mt-0.5">Changes will reflect immediately for interpreters and agency staff.</p>
          </div>
          <button
            onClick={() => setIsEditAccessOpen(false)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSaveAccess} className="space-y-4">
          {/* Schedule & Time */}
          {isScheduleLocked ? (
            <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200/80 space-y-2.5">
              <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs">
                <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Date, time & timezone are locked</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                The date, time and time zone cannot be changed while an interpreter is booked: moving them would skip the availability check they were booked under. You can still update meeting credentials, venue instructions, contacts and notes below.
              </p>
              <div className="text-xs text-gray-700 bg-white/90 p-2.5 rounded-lg border border-amber-200/50 flex items-center justify-between">
                <span>{formatDetailsDate(assignment.startsAt, assignment.endsAt, editTimeZone)}</span>
                <span className="font-mono text-gray-500">{editTimeZone.split(' — ')[0]}</span>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/60 space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Date, Time & Timezone</h4>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Appointment Time Zone</label>
                <select
                  value={editTimeZone}
                  onChange={(e) => setEditTimeZone(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                >
                  <option value="Pacific Time — Seattle, Los Angeles">Pacific Time — Seattle, Los Angeles</option>
                  <option value="Mountain Time — Denver">Mountain Time — Denver</option>
                  <option value="Arizona (no daylight saving)">Arizona (no daylight saving)</option>
                  <option value="Central Time — Chicago">Central Time — Chicago</option>
                  <option value="Eastern Time — New York">Eastern Time — New York</option>
                  <option value="Alaska Time">Alaska Time</option>
                  <option value="Hawaii Time">Hawaii Time</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                  />
                </div>
              </div>

              {isQuickEditTimeInvalid && (
                <p className="text-xs text-red-600 font-medium mt-1">
                  The end time must be after the start time.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Setting</label>
              <select
                value={editSetting}
                onChange={(e) => setEditSetting(e.target.value)}
                className="w-full bg-[#F5F4F0] border-none rounded-xl px-3.5 py-2.5 text-sm text-[var(--ink)] focus:ring-2 focus:ring-[#0B3B32] outline-none"
              >
                <option value="Medical">Medical</option>
                <option value="Legal">Legal</option>
                <option value="Educational">Educational</option>
                <option value="Mental Health">Mental Health</option>
                <option value="Social Services">Social Services</option>
                <option value="General">General</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Format</label>
              <select
                value={editFormat}
                onChange={(e) => setEditFormat(e.target.value)}
                className="w-full bg-[#F5F4F0] border-none rounded-xl px-3.5 py-2.5 text-sm text-[var(--ink)] focus:ring-2 focus:ring-[#0B3B32] outline-none"
              >
                <option value="Virtual">Virtual</option>
                <option value="In person">In person</option>
              </select>
            </div>
          </div>

          {editFormat.toLowerCase().includes('virtual') ? (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/60 space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Virtual Meeting Details</h4>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Platform</label>
                <select
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                >
                  <option value="Zoom">Zoom</option>
                  <option value="Microsoft Teams">Microsoft Teams</option>
                  <option value="Google Meet">Google Meet</option>
                  <option value="Webex">Webex</option>
                  <option value="Virtual">Other Virtual Platform</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Meeting Link / Join URL</label>
                <input
                  type="text"
                  placeholder="https://zoom.us/j/..."
                  value={editMeetingLink}
                  onChange={(e) => setEditMeetingLink(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Meeting ID</label>
                  <input
                    type="text"
                    placeholder="e.g. 812 3456 7890"
                    value={editMeetingId}
                    onChange={(e) => setEditMeetingId(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Passcode / Access Code</label>
                  <input
                    type="text"
                    placeholder="e.g. 984210"
                    value={editPasscode}
                    onChange={(e) => setEditPasscode(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Virtual Instructions / Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Waiting room enabled, join 5 mins before start."
                  value={editVirtualInstructions}
                  onChange={(e) => setEditVirtualInstructions(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/60 space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Physical Location Details</h4>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Venue / Facility Name</label>
                <input
                  type="text"
                  placeholder="e.g. Medical Center or Clinic"
                  value={editVenue}
                  onChange={(e) => setEditVenue(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  placeholder="e.g. 325 9th Ave, Seattle, WA 98104"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Building / Room</label>
                  <input
                    type="text"
                    placeholder="e.g. West Wing, Room 302"
                    value={editBuilding}
                    onChange={(e) => setEditBuilding(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">On-site Contact</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Silva"
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Contact Method</label>
                <input
                  type="text"
                  placeholder="e.g. Text message or Phone"
                  value={editContactMethod}
                  onChange={(e) => setEditContactMethod(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
                />
              </div>
            </div>
          )}

          {isScheduleLocked && (
            <div>
              <label htmlFor="quick-edit-interpreter-message" className="block text-xs font-medium text-gray-700 mb-1">Message to interpreter (Optional)</label>
              <textarea
                id="quick-edit-interpreter-message"
                rows={3}
                maxLength={1000}
                value={quickEditMessage}
                onChange={(e) => setQuickEditMessage(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[#0B3B32]"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Added to the “Job details updated” email the booked interpreter gets when you save, e.g. to answer their question, and kept on their job page. It is emailed, so don't include client names or health information. ({quickEditMessage.length}/1000)
              </p>
              {quickEditMessage.trim() && (
                <MessageRecipientSelect id="quick-edit-recipient" className="mt-3" recipients={messageRecipients} value={quickEditRecipient} onChange={setQuickEditRecipient} />
              )}
            </div>
          )}

          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100">{saveError}</p>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsEditAccessOpen(false)}
              className="px-5 py-2 rounded-full text-sm font-medium border border-gray-300 hover:bg-gray-50 text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingAccess || (!isScheduleLocked && isQuickEditTimeInvalid) || (isScheduleLocked && Boolean(quickEditMessage.trim()) && messageRecipients.length > 1 && !quickEditRecipient)}
              className="px-6 py-2 rounded-full text-sm font-medium text-white bg-[var(--forest)] hover:bg-[var(--forest)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingAccess ? 'Saving...' : 'Save details'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )}

  {showRemoveBookingModal && (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-7 w-full max-w-[480px] mx-auto shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-[var(--ink)]">Remove assigned interpreter?</h3>
          <button
            onClick={() => {
              setShowRemoveBookingModal(false);
              setRemoveBookingTarget(null);
            }}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-6">
          This will unassign <span className="font-semibold text-gray-800">{removeBookingTarget?.interpreterName || (removeBookingTarget?.positionIndex === 2 ? slot2Accepted?.interpreterName : slot1Accepted?.interpreterName) || 'the interpreter'}</span> and reopen <span className="font-semibold text-gray-800">Position {removeBookingTarget?.positionIndex || 1}</span> so a new interpreter can be offered or assigned immediately.{' '}
          {totalPositions === 2 ? (
            <>
              Position {removeBookingTarget?.positionIndex === 2 ? '1' : '2'} will remain completely untouched. The appointment will not be cancelled; its status will transition to{' '}
              <span className="font-semibold text-amber-700">Needs replacement</span> ({Math.max(0, staffedCount - 1)} of 2 staffed).
            </>
          ) : (
            <>
              The appointment will not be cancelled; its status will transition to{' '}
              <span className="font-semibold text-amber-700">Needs replacement</span> (0 of 1 staffed).
            </>
          )}
        </p>

        {removeBookingError && (<p className="text-[#C23B22] text-sm mb-4" role="alert">{removeBookingError}</p>)}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setShowRemoveBookingModal(false);
              setRemoveBookingTarget(null);
            }}
            disabled={isRemovingBooking}
            className="px-5 py-2.5 rounded-full text-sm font-medium border border-gray-300 hover:bg-gray-50 text-gray-700 transition-colors"
          >
            Keep interpreter
          </button>
          <button
            type="button"
            onClick={handleConfirmRemoveBooking}
            disabled={isRemovingBooking}
            className="px-5 py-2.5 rounded-full text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isRemovingBooking ? 'Removing...' : 'Confirm removal'}
          </button>
        </div>
      </div>
    </div>
  )}

  {/* Global Toast Notification */}
  {toastMessage && (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#0A3D31] text-white px-5 py-3.5 rounded-2xl shadow-xl border border-[#145347] transition-all duration-300">
      <div className="w-6 h-6 rounded-full bg-[#10b981] flex items-center justify-center text-white shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <span className="text-sm font-medium">{toastMessage}</span>
      <button 
        type="button" 
        onClick={() => setToastMessage(null)}
        className="ml-2 text-gray-300 hover:text-white text-lg leading-none"
        aria-label="Close notification"
      >
        &times;
      </button>
    </div>
  )}
 </div>
 );
}
