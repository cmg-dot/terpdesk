"use client";

import { settingLabel } from "@/lib/settingLabel";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRequests } from "@/context/RequestsContext";
import { useGlobalState } from "@/context/GlobalContext";
import { ChevronDown, Copy, Check, ExternalLink, Video, MapPin, Edit2, X, Lock, Clock, Building2 } from "lucide-react";
import { fetchLiveRequestById } from "@/app/actions/getRequests";
import { removeBooking } from "@/app/actions/removeBooking";
import { getInterpreters } from "@/app/actions/getInterpreters";
import { updateOfferStatus } from "@/app/actions/updateOfferStatus";
import { cancelRequest } from "@/app/actions/cancelRequest";
import { wallClockToUtc, wallClockToUtcDate, getIanaZone, parseInstantInZone, resolveJobZone, resolveRequestTimes } from "@/utils/timezone";
import { formatInTimeZone } from "date-fns-tz";
import { isAppointmentHappeningNow, isUnfilledPastDue } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { formatReference } from "@/utils/statusEngine";
import { getInterpretersFitForJob } from "@/app/actions/availability";
import type { InterpreterFitStatus } from "@/app/actions/availability";
import { PrepMaterialsSection } from "@/components/requests/PrepMaterialsSection";
import { RequestHeadline } from "@/components/requests/RequestHeadline";
import { RequestActionBar } from "@/components/requests/RequestActionBar";
import { calendarLink } from "@/lib/calendarLink";
import { ReturnUnfilledDialog } from "@/components/requests/ReturnUnfilledDialog";
import { VoidJobDialog } from "@/components/requests/VoidJobDialog";
import { requestOrganization, requestSrn, requestWhere } from "@/lib/requestSummary";
import { formatHoursMinutes } from "@/lib/durationFormat";
import type { DirectAssignSuccess } from "@/components/requests/DirectAssignPanel";
import { ClarificationsCard } from "@/components/requests/ClarificationsCard";
import { CollapsibleStateForm } from "@/components/requests/CollapsibleStateForm";
import { OriginalFormCard } from "@/components/requests/OriginalFormCard";
import { StaffingPanel } from "@/components/requests/staffing/StaffingPanel";
import type { Position, PositionView, StaffActiveOffer, StaffingActions, StaffingContext } from "@/components/requests/staffing/staffingTypes";
import { usePositionOfferForms } from "@/hooks/usePositionOfferForms";
import { usePositionSlots } from "@/hooks/usePositionSlots";
import { bookedCountOf, occupiesAnotherPosition, resolvePositions } from "@/lib/positionBookings";
import { MAX_POSITIONS } from "@/lib/positions";
import { buildStateFormView, notesWithoutFormSection5 } from "@/lib/stateFormView";
import { RequestActivityCard } from "@/components/requests/RequestActivityCard";
import { legacyPosition1Hours } from "@/utils/hoursState";
import { bookedRecipients } from "@/utils/messageRecipients";
import { QuickEditAccessModal } from "@/components/requests/QuickEditAccessModal";
import type { SavedDetails } from "@/components/requests/QuickEditAccessModal";
import { syncStoredJob } from "@/lib/quickEditAccess";
import type { QuickEditValues } from "@/lib/quickEditAccess";
import { formatDetailsDate, mapSafeZone, parseSafeDate } from "@/lib/requestDetailsFormat";
import { getTimesheetStatus } from "@/app/actions/getTimesheetStatus";
import { getClientsAction } from "@/app/actions/clients";
import type { ClientWithStats } from "@/app/actions/clients";
import { ClientAssignmentBanner } from "@/components/features/ClientAssignmentBanner";
import { normalizeClientType } from "@/lib/validation/client";
import { isStateJobRequest } from "@/lib/stateJob";
import { hasSubmittedHours, isOnsiteSignatureRequired } from "@/lib/onsiteSignature";
import { OnsiteSignatureSetting } from "@/components/requests/OnsiteSignatureSetting";
import type { TimesheetFlags } from "@/app/actions/getTimesheetStatus";

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

function getMockInterpreterDetails(id: string) {
  if (id === 'terp-1') return { name: "Active Interpreter" };
  if (id === 'terp-new') return { name: "New Interpreter" };
  return { name: `Interpreter ${id}` };
}

// Label above value on phones (full width for the value, so long text wraps cleanly); side by side from 640px up
// with a real gap and the value right-aligned, wrapping inside its own column instead of against the label.
function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
 return (
 <div className="flex flex-col gap-1 border-b border-gray-50 py-3.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
 <span className="shrink-0 text-sm text-[var(--sage)] sm:pt-px">{label}</span>
 <span className="min-w-0 break-words text-sm font-medium leading-relaxed text-[var(--ink)] sm:max-w-[65%] sm:text-right">{value}</span>
 </div>
 );
}

/** "Venue · Street address" (how the location is stored) as separate lines, so the address does not run into the name. */
function LocationLines({ text }: { text: string }) {
 const lines = String(text ?? "").split(" · ").map((l) => l.trim()).filter(Boolean);
 if (lines.length <= 1) return <>{text}</>;
 return (
 <>
 {lines.map((line, i) => (
 <span key={i} className={i === 0 ? "block" : "block font-normal text-gray-600"}>{line}</span>
 ))}
 </>
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
  const [interpreterFitMap, setInterpreterFitMap] = useState<Record<string, InterpreterFitStatus>>({});
  const [isInterpreterFitLoading, setIsInterpreterFitLoading] = useState(true);
  const [interpreterFitError, setInterpreterFitError] = useState<string | null>(null);

  useEffect(() => {
    getInterpreters().then(setDbInterpreters).catch(() => console.error("[requests/[id] page] request failed"));
  }, []);

  const activeRoster = dbInterpreters.map(m => ({
    id: m.id,
    name: m.name,
    email: m.email,
  }));

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

  const isCancelled = foundRequest?.status === 'Cancelled' || foundRequest?.status === 'cancelled';
  const realOffers = foundRequest?.offers || [];

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

  // Every active position, in order: who is booked, the offer out, earlier offers, and whether it needs a replacement.
  const positionFacts = resolvePositions(foundRequest, realOffers, isLiveOffer);
  const totalPositions = Math.max(1, positionFacts.length);
  const staffedCount = bookedCountOf(positionFacts);
  const isAllPositionsFilled = staffedCount >= totalPositions && totalPositions > 0;
  const positionIds = positionFacts.map((f) => f.id);

  const reloadRequest = async () => { setFoundRequest(await fetchLiveRequestById(id)); };
  const offerForms = usePositionOfferForms({ requestId: id, request: foundRequest, ids: positionIds, dbInterpreters, fits: interpreterFitMap, reload: reloadRequest, toast: showToast });
  const slotActions = usePositionSlots({ requestId: id, reload: async () => { await reloadRequest(); router.refresh(); }, toast: showToast });

  // Rule: no interpreter in two positions of the same job. Each position's roster leaves out whoever is in any other position.
  const rosterFor = (position: number) => activeRoster.filter((i) => !occupiesAnotherPosition(positionFacts, offerForms.recipients, position, i.id, i.name));

  const hasLivePendingOffer = Boolean(
    positionFacts.some((f) => f.activeOffer) ||
    (!isAppointmentFinished && realOffers.some((o: any) => isLiveOffer(o)))
  );

  const hasAcceptedBooking = Boolean(
    staffedCount > 0 ||
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
  // Team jobs: the message goes to one booked interpreter (the one being replied to), never the whole team.
  const messageRecipients = bookedRecipients(realOffers, positionIds);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);

 const [showCancelModal, setShowCancelModal] = useState(false);
 const [showVoidModal, setShowVoidModal] = useState(false);
 const [showReturnModal, setShowReturnModal] = useState(false);
 const [cancelReasonInput, setCancelReasonInput] = useState('');
 const [clientRequested, setClientRequested] = useState(false);
 const cancelReason = foundRequest?.cancelReason || cancelReasonInput;
 const cancelDate = foundRequest?.canceledAt || '';

  // Quick-update access & location: the modal owns its whole form (QuickEditAccessModal), so typing or picking in it never
  // re-renders this page. The page only opens it and refreshes after a save.
  const [isEditAccessOpen, setIsEditAccessOpen] = useState(false);
  const openEditAccessModal = () => setIsEditAccessOpen(true);
  const closeEditAccessModal = () => setIsEditAccessOpen(false);

  const handleAccessSaved = async (result: SavedDetails, values: QuickEditValues) => {
    setActivityVersion((v) => v + 1);
    setEditNotice(
      result.notifiedInterpreters > 0
        ? `Saved. ${result.notifiedInterpreters === 1 ? "The booked interpreter was" : `${result.notifiedInterpreters} booked interpreters were`} emailed what changed.`
        : null,
    );
    const updated = await fetchLiveRequestById(id);
    setFoundRequest(updated);
    syncStoredJob(id, values, updated, result.request?.data);
  };

  const [showRemoveBookingModal, setShowRemoveBookingModal] = useState(false);
  const [removeBookingTarget, setRemoveBookingTarget] = useState<{
    positionIndex: Position;
    offerId?: string;
    interpreterName: string;
  } | null>(null);
  const [isRemovingBooking, setIsRemovingBooking] = useState(false);
  const [removeBookingError, setRemoveBookingError] = useState<string | null>(null);
  const router = useRouter();

  const handleOpenRemoveBookingModal = (positionIndex: Position, offerId?: string, interpreterName?: string) => {
    setRemoveBookingError(null);
    setRemoveBookingTarget({
      positionIndex,
      offerId,
      interpreterName: interpreterName || `Position ${positionFacts.find((f) => f.id === positionIndex)?.ordinal ?? positionIndex} interpreter`
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
          console.error("[requests/[id] page] operation failed");
        }
      }

      // Close the modal right away, then invalidate and refetch so the UI reflects the DB
      setShowRemoveBookingModal(false);
      setRemoveBookingTarget(null);
      const updated = await fetchLiveRequestById(id);
      setFoundRequest(updated);
      router.refresh();
    } catch (err) {
      console.error("[requests/[id] page] operation failed");
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
        console.error("[requests/[id] page] operation failed");
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
        console.error("[requests/[id] page] operation failed");
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
     console.error("[requests/[id] page] operation failed");
   }
 };

  // Agency override: the server already booked the interpreter and closed the pending offers; just reflect it here.
  const handleDirectlyAssigned = async (posIdx: Position, result: DirectAssignSuccess) => {
    offerForms.clearRecipient(posIdx);
    try {
      setFoundRequest(await fetchLiveRequestById(id));
    } catch {
      console.error("[requests/[id] page] request failed");
    }
    updateRequest(id, { status: result.status });
    showToast(
      result.emailed
        ? `${result.interpreterName} is assigned and was emailed the booking details.`
        : `${result.interpreterName} is assigned, but the email could not be sent. Use "Resend details".`
    );
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
 details: foundRequest.details || { setting: settingLabel(foundRequest.setting), purpose: "Routine checkup", format: foundRequest.format || "In person", timeZone: "Pacific Time — Seattle, Los Angeles", deafParticipant: "1", peopleNeeding: "1", commPreferences: "ASL", qualifications: "Medical certified" },
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
 // The first-look facts for the header and the overview: who it is for, the state SRN, when, and where.
 const organizationName = requestOrganization(foundRequest);
 const requestSrnValue = requestSrn(foundRequest);
 const where = requestWhere(foundRequest);
 const isStateRequest = isStateJobRequest({ isStateJob: foundRequest?.isStateJob, data: foundRequest?.data });
 const whenText = formatDetailsDate(assignment.startsAt, assignment.endsAt, assignment.details?.timeZone || assignment.timeZone);
 const showMissingAddress = where.missingAddress && !where.virtual && where.text !== 'Location pending';

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

 const inputClass = "w-full bg-[#F4F3EF] border-none rounded-full px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[var(--forest)] outline-none transition-shadow";

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

 // ---- What the form document and the staffing panel are given (the state and the server calls stay in this page) ----
 const stateFormView = buildStateFormView({
   data: foundRequest?.data,
   startsAt: reqStartsAt,
   endsAt: reqEndsAt,
   timeZone: assignment.details?.timeZone || assignment.timeZone,
 });
 // Section 5 is on the form above (staff only): the notes card does not repeat it.
 const privateNotesText = notesWithoutFormSection5(textOf(foundRequest?.privateNotes), stateFormView);
 const prepNotesText = textOf(foundRequest?.prepNotes);
 const requestedInterpreterName = textOf(foundRequest?.data?.intake?.requestedInterpreter) || null;
 const fullRoster = activeRoster.map((person) => ({ id: String(person.id), name: String(person.name ?? '') }));

 const isClosedOut = Boolean(foundRequest?.isCompleted);
 const addBlockedReason = isCancelled ? 'This appointment is cancelled.'
   : isClosedOut ? 'This appointment is closed out.'
   : isAppointmentFinished ? 'This appointment has ended.'
   : totalPositions >= MAX_POSITIONS ? `A job can have at most ${MAX_POSITIONS} interpreter positions.`
   : null;

 const positionViews: PositionView[] = positionFacts.map((facts) => {
   const form = offerForms.formOf(facts.id);
   const accepted = facts.accepted;
   const removeBlockedReason = isCancelled || isClosedOut ? 'This appointment is cancelled or closed out.'
     : accepted ? 'An interpreter is booked here. Remove the booking first.'
     : facts.activeOffer ? 'An offer is waiting for an answer. Withdraw it first.'
     : totalPositions <= 1 ? 'A job needs at least one interpreter position.'
     : null;
   return {
     posIdx: facts.id,
     ordinal: facts.ordinal,
     canRemove: removeBlockedReason === null,
     removeBlockedReason,
     accepted,
     activeOffer: facts.activeOffer as StaffActiveOffer | null,
     pastOffers: facts.pastOffers,
     needsReplacement: facts.needsReplacement,
     roster: rosterFor(facts.id),
     recipient: form.recipient,
     expiryHours: form.expiryHours,
     expiryMinutes: form.expiryMinutes,
     errorMessage: form.errorMessage,
     successMessage: form.successMessage,
     isSending: form.isSending,
     offerLocked: Boolean(offerForms.engaged[facts.id]),
     assignedInterpreterId: accepted
       ? String(accepted.interpreterId || facts.reservedBy || dbInterpreters.find((i: { name: string }) => i.name === accepted.interpreterName)?.id || '')
       : '',
     hasHours: Boolean(foundRequest?.data?.hoursSubmissions?.[facts.id] || (facts.id === 1 && legacyPosition1Hours(foundRequest?.data))),
   };
 });

 const staffingCtx: StaffingContext = {
   requestId: String(foundRequest?.id || id || ''),
   totalPositions,
   maxPositions: MAX_POSITIONS,
   slotBusy: slotActions.busy,
   slotError: slotActions.error,
   addBlockedReason,
   offers: realOffers,
   nowMs: currentTime,
   isCancelled,
   isFutureAppointment,
   isAppointmentInProgress,
   isAppointmentFinished,
   isBookingLocked,
   isStateJob: isStateJobRequest({ isStateJob: foundRequest?.isStateJob, data: foundRequest?.data }),
   startsAtIso: reqStartsAt,
   endsAtIso: reqEndsAt,
   startsAt: parseSafeDate(foundRequest?.startsAt),
   jobZone: resolveJobZone(foundRequest),
   apptTimeZone: foundRequest?.details?.timeZone || foundRequest?.timeZone,
   fits: interpreterFitMap,
   fitsLoading: isInterpreterFitLoading,
   fitsError: interpreterFitError,
   timesheetFlags,
 };

 const staffingActions: StaffingActions = {
   setRecipient: offerForms.setRecipientFor,
   setExpiry: offerForms.setExpiry,
   createOffer: offerForms.send,
   withdrawOffer: async (offerId) => {
     try {
       await updateOfferStatus(offerId, 'withdrawn');
       const updatedRequest = await fetchLiveRequestById(id);
       setFoundRequest(updatedRequest);
     } catch (err) {
       console.error("[requests/[id] page] operation failed");
     }
   },
   directlyAssigned: handleDirectlyAssigned,
   setAssignEngaged: offerForms.setEngaged,
   addSlot: slotActions.add,
   removeSlot: slotActions.remove,
   clearSlotError: slotActions.clearError,
   openRemoveBooking: handleOpenRemoveBookingModal,
   openAccess: openEditAccessModal,
   toast: showToast,
   reloadTimesheetFlags: (requestId) => { void loadTimesheetFlags(requestId); },
 };

 return (
 <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 space-y-6 pb-24 antialiased">
 {/* Test Banner */}
 {/* Back Link */}
 <Link href="/requests" className="inline-flex items-center gap-2 text-[var(--sage)] hover:text-[var(--ink)] mb-4 transition-colors">
 ← Back to assignments
 </Link>

 {/* Header: the headline and summary bar run full width; the actions get their own toolbar row beneath them. */}
 <header className="mb-8">
 <RequestHeadline
   organization={organizationName}
   title={assignment.title}
   srn={requestSrnValue}
   idLabel={requestSrnValue ? "State SRN" : "Reference"}
   idValue={requestSrnValue ?? assignment.overview.reference}
   whenText={whenText}
   where={where}
   repeatsText={isRepeating ? recurrenceDisplay : null}
   badges={
     <>
       {isAppointmentHappeningNow(assignment, currentTime) && <HappeningNowBadge />}
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
         foundRequest?.isReturned
           ? <span className="bg-amber-50 text-amber-800 text-[13px] font-medium px-3 py-1 rounded-full border border-amber-200">Returned</span>
         : foundRequest?.isVoided
           ? <span className="bg-slate-200 text-slate-700 text-[13px] font-medium px-3 py-1 rounded-full border border-slate-300">Voided</span>
           : <span className="bg-[#FEF2F2] text-[#991B1B] text-[13px] font-medium px-3 py-1 rounded-full border border-[#FCA5A5]/30">Cancelled</span>
       )}
     </>
   }
 />
 <RequestActionBar
   calendarHref={calendarLink({ id, startsAt: assignment.startsAt, srn: requestSrnValue })}
   editHref={`/requests/${params.id}/edit`}
   isCancelled={isCancelled}
   isEditLocked={isEditLocked}
   editLockMessage={editLockMessage}
   onQuickEdit={openEditAccessModal}
   onCancel={handleCancelAppointment}
   onVoid={() => setShowVoidModal(true)}
   canReturnUnfilled={!isCancelled && !hasAcceptedBooking}
   onReturnUnfilled={() => setShowReturnModal(true)}
 />
 </header>

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

 {isCancelled && foundRequest?.isVoided && (
 <div className="space-y-4 mb-6">
 <div className="bg-slate-100 border border-slate-300 text-slate-700 px-6 py-4 rounded-2xl text-[14px] leading-relaxed">
 This appointment was voided: it should never have been a job. It is closed, off billing and kept for the record. Nobody is expected to work it.
 </div>
 <div className="bg-[#F5F4F0] text-gray-600 px-6 py-4 rounded-2xl border border-gray-200 text-sm">
 Internal reason (agency only): {foundRequest?.cancelReason || "No reason provided"}
 </div>
 </div>
 )}
 {isCancelled && foundRequest?.isReturned && (
 <div className="space-y-4 mb-6" data-returned-banner>
 <div className="bg-amber-50 border border-amber-200 text-amber-900 px-6 py-4 rounded-2xl text-[14px] leading-relaxed">
 This appointment was marked unable to fill and returned. It is closed, off billing and kept for the record. Nobody is expected to work it.
 {isStateRequest && (foundRequest?.returnedInPortal ? " It was also returned in the ODHH portal." : " It was not recorded as returned in the ODHH portal.")}
 </div>
 <div className="bg-[#F5F4F0] text-gray-600 px-6 py-4 rounded-2xl border border-gray-200 text-sm">
 Internal note (agency only): {foundRequest?.cancelReason || "No reason provided"}
 </div>
 </div>
 )}
 {isCancelled && !foundRequest?.isVoided && !foundRequest?.isReturned && (
 <div className="space-y-4 mb-6">
 <div className="bg-[#FEF2F2] border border-[#FCA5A5]/30 text-[#991B1B] px-6 py-4 rounded-2xl border border-gray-200 text-[14px] leading-relaxed">
 This appointment was cancelled {cancelDate ? (() => {
   try {
     const d = parseSafeDate(cancelDate);
     if (!d) return '';
     return formatInTimeZone(d, resolveJobZone(foundRequest), "MMM d, yyyy h:mm a zzz");
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
 {/* The state's request form is the page: its five numbered sections, from the saved email or from what the job has on file. */}
 <CollapsibleStateForm view={stateFormView} summary={{ srn: requestSrnValue, when: whenText, location: where.text }} />

 {/* The state's email as it arrived, folded away and loaded only when opened. */}
 <OriginalFormCard requestId={String(foundRequest?.id || id)} srn={requestSrnValue} />

 {/* Staffing and booking, directly under the form. */}
 {!isCancelled && <StaffingPanel positions={positionViews} ctx={staffingCtx} actions={staffingActions} requestedInterpreter={requestedInterpreterName} fullRoster={fullRoster} clientName={textOf(foundRequest?.details?.deafParticipant)} onClientSaved={(name: string) => setFoundRequest((prev: any) => (prev ? { ...prev, details: { ...(prev.details || {}), deafParticipant: name } } : prev))} priorAuth={textOf(foundRequest?.data?.intake?.priorAuthNumber)} onPriorAuthSaved={(value: string) => setFoundRequest((prev: any) => (prev ? { ...prev, data: { ...(prev.data || {}), intake: { ...(prev.data?.intake || {}), priorAuthNumber: value } } } : prev))} />}

 {!isCancelled && !isStateRequest && (
 <OnsiteSignatureSetting
 requestId={String(foundRequest?.id || id)}
 required={isOnsiteSignatureRequired({ isStateJob: foundRequest?.isStateJob, data: foundRequest?.data })}
 locked={hasSubmittedHours(foundRequest?.data)}
 onChanged={(next) => setFoundRequest((prev: any) => (prev ? { ...prev, data: { ...(prev.data || {}), onsiteSignatureRequired: next } } : prev))}
 />
 )}

 {/* The older detail cards (still editable from here) are folded away so the form stays the focus. */}
 <details data-job-details className="group rounded-2xl border border-gray-200 bg-white">
 <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-[16px] font-medium text-[var(--ink)] sm:px-8 [&::-webkit-details-marker]:hidden">
 <span>Job details on file <span className="ml-1 text-sm font-normal text-[var(--sage)]">overview, format, location, preparation notes, requester</span></span>
 <ChevronDown className="h-5 w-5 flex-none text-[var(--forest)] transition-transform group-open:rotate-180" aria-hidden="true" />
 </summary>
 <div className="flex flex-col gap-6 border-t border-gray-100 p-4 sm:p-6">
 
 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Overview</h2>
 <div className="flex flex-col">
 <DataRow label="Organization" value={organizationName ?? "Not provided"} />
 <DataRow label="Date & time" value={whenText} />
 <DataRow
   label={where.virtual ? "Format" : "Location"}
   value={<><LocationLines text={where.text} />{showMissingAddress && <span className="mt-1 block text-xs font-normal text-amber-700">No street address on file. Add it with Quick edit, or forward the state's original email to fill it in.</span>}</>}
 />
 <DataRow
   label={requestSrnValue ? "State SRN" : "Reference"}
   value={requestSrnValue ? <>{requestSrnValue}<span className="block text-xs font-normal text-gray-500">terpDESK ref {assignment.overview.reference}</span></> : assignment.overview.reference}
 />
 <DataRow label="Status" value={assignment.overview.status} />
 {assignment.overview.repeats && <DataRow label="Repeats" value={String(assignment.overview.repeats)} />}
 <DataRow label="Program" value={programLabel} />
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
              value={settingLabel(assignment.details?.setting, foundRequest?.setting)}
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
 {prepNotesText || <span className="text-sm italic text-gray-400">No preparation notes.</span>}
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
 className="inline-block mt-4 rounded-full px-5 py-2.5 text-sm font-medium text-white bg-[var(--forest)] hover:bg-[var(--forest-bright-hover)] transition-colors"
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
 <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-gray-300 text-[var(--forest)] focus:ring-[var(--forest)]" />
 <span className="text-sm text-gray-800 leading-snug">Ask each interpreter for a service-verification signature</span>
 </label>
 </div>

 </div>
 </details>

 {(() => {
   const isOdhh = foundRequest?.data?.intake?.program === 'WA ODHH' || foundRequest?.data?.intake?.program === 'wa_odhh' || foundRequest?.program === 'WA ODHH' || foundRequest?.program === 'wa_odhh';
   const hoursMap = (foundRequest?.hoursSubmissions || foundRequest?.data?.hoursSubmissions || {}) as Record<number, any>;
   // Legacy single-position field = Position 1 only (a copy marked Position 2 is ignored).
   const legacyHours = legacyPosition1Hours(foundRequest?.data) || legacyPosition1Hours(foundRequest);
   if (!hoursMap[1] && legacyHours) {
     hoursMap[1] = legacyHours;
   }

   const positionsWithHours = positionIds.filter(pos => {
     return Boolean(hoursMap[pos] || (pos === 1 && (foundRequest?.travelStartTime || ['awaiting_review', 'correction_requested', 'approved'].includes(foundRequest?.status))));
   });

   if (positionsWithHours.length === 0) return null;

   // Every date and time on this card is read and shown in the job's own saved zone, never the browser's.
   const tz = resolveJobZone(foundRequest);

   const formatRange = (startIso?: string | null, endIso?: string | null) => {
     try {
       if (!startIso) return 'Not reported';
       const s = parseInstantInZone(startIso, tz);
       if (!s) return 'Not reported';
       const e = endIso ? parseInstantInZone(endIso, tz) : null;
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
             {totalPositions > 1 ? 'Tracked and reviewed per interpreter position' : 'Actual service time submitted by interpreter'}
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
           const posFacts = positionFacts.find((f) => f.id === posIdx);
           const posOrdinal = posFacts?.ordinal ?? posIdx;
           const posInterpreterName = posFacts?.accepted?.interpreterName || hoursSub?.interpreterName || `Position ${posOrdinal} interpreter`;
           
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
             const s = parseInstantInZone(actualStart, tz);
             const e = parseInstantInZone(actualEnd, tz);
             if (s && e) {
               const mins = Math.max(0, ((e.getTime() - s.getTime()) / 60000) - (hoursSub?.breakMinutes || 0));
               serviceTimeStr = formatHoursMinutes(mins);
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
                   <span className="font-semibold text-sm text-[var(--ink)]">Position {posOrdinal} · {posInterpreterName}</span>
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

 <div className={cardClass}>
 <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Agency-private notes</h2>
 <p className="whitespace-pre-line text-gray-800 text-[15px] leading-relaxed">
 {privateNotesText || <span className="text-sm italic text-gray-400">No private notes.</span>}
 </p>
 </div>

 <RequestActivityCard
 requestId={id}
 timeZone={getIanaZone(assignment.details?.timeZone || assignment.timeZone)}
 refreshKey={`${activityVersion}-${foundRequest?.status ?? ""}-${(foundRequest?.offers || []).length}`}
 cardClass={cardClass}
 />

 </div>

 <ReturnUnfilledDialog
 open={showReturnModal}
 onOpenChange={setShowReturnModal}
 requestId={id}
 isStateJob={isStateRequest}
 srn={requestSrnValue}
 hasOpenOffer={hasLivePendingOffer}
 onReturned={async () => { try { setFoundRequest(await fetchLiveRequestById(id)); } catch { console.error("[requests/[id] page] request failed"); } }}
 />
 <VoidJobDialog
 open={showVoidModal}
 onOpenChange={setShowVoidModal}
 requestId={id}
 hasInterpreters={hasAcceptedBooking}
 onVoided={async () => { try { setFoundRequest(await fetchLiveRequestById(id)); } catch { console.error("[requests/[id] page] request failed"); } }}
 />
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
   const hasBookedInterpreter = staffedCount > 0;
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
 className="w-full bg-[#F5F4F0] border-none rounded-2xl px-4 py-3.5 text-sm text-[var(--ink)] focus:ring-2 focus:ring-[var(--forest)] outline-none" 
 />
 </div>
 
 <label className="flex items-center gap-3 cursor-pointer">
 <input 
 type="checkbox" 
 checked={clientRequested}
 onChange={(e) => setClientRequested(e.target.checked)}
 className="h-5 w-5 rounded border-gray-300 text-[var(--forest)] focus:ring-[var(--forest)]" 
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
    <QuickEditAccessModal
      requestId={id}
      request={foundRequest}
      scheduleLocked={isScheduleLocked}
      editLocked={isEditLocked}
      editLockMessage={editLockMessage}
      recipients={messageRecipients}
      onSaved={handleAccessSaved}
      onClose={closeEditAccessModal}
    />
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
          This will unassign <span className="font-semibold text-gray-800">{removeBookingTarget?.interpreterName || positionFacts.find((f) => f.id === removeBookingTarget?.positionIndex)?.accepted?.interpreterName || 'the interpreter'}</span> and reopen <span className="font-semibold text-gray-800">Position {positionFacts.find((f) => f.id === removeBookingTarget?.positionIndex)?.ordinal ?? 1}</span> so a new interpreter can be offered or assigned immediately.{' '}
          {totalPositions > 1 ? (
            <>
              The other {totalPositions - 1 === 1 ? 'position' : 'positions'} will remain completely untouched. The appointment will not be cancelled; its status will transition to{' '}
              <span className="font-semibold text-amber-700">Needs replacement</span> ({Math.max(0, staffedCount - 1)} of {totalPositions} staffed).
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
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[var(--mint-pale-ink)] text-white px-5 py-3.5 rounded-2xl shadow-xl border border-[var(--forest-bright)] transition-all duration-300">
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
