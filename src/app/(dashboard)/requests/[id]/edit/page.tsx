"use client";

import { PositionCountField } from "@/components/requests/PositionCountField";
import { countFromLabel, positionsLabel, readPositions } from "@/lib/positions";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useRequests } from "@/context/RequestsContext";
import { useRouter, useParams } from "next/navigation";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { fetchLiveRequestById } from "@/app/actions/getRequests";
import { updateRequestAction } from "@/app/actions/updateRequest";
import { getIanaZone, buildAppointmentUtcTimes } from "@/utils/timezone";
import { Lock, AlertTriangle } from "lucide-react";
import { getSavedAgencyRequesters, saveAgencyRequester, formatRequesterLabel, type SavedAgencyRequester } from "@/utils/savedRequesters";
import { getClientsAction, saveRequesterToClientsAction, type ClientWithStats } from "@/app/actions/clients";
import { isInvalidEmail } from "@/utils/validation";
import { IconInput } from "@/components/ui/IconInput";
import { bookedRecipients, defaultRecipient } from "@/utils/messageRecipients";
import { MessageRecipientSelect } from "@/components/requests/MessageRecipientSelect";
import { VirtualMeetingFields, isVirtualFormat } from "@/components/requests/VirtualMeetingFields";
import { programIdentifiers } from "@/lib/programIdentifiers";
import { RoomFloorFields } from "@/components/requests/form/RoomFloorFields";
import { RequestFlagsCard } from "@/components/requests/form/RequestFlagsCard";
import { OnsiteSignatureCard } from "@/components/requests/form/OnsiteSignatureCard";
import { hasSubmittedHours } from "@/lib/onsiteSignature";
import { PatientInfoCard } from "@/components/requests/form/PatientInfoCard";
import { EMPTY_EXTRAS, buildExtrasPayload, extrasFromRequest } from "@/lib/requestFormExtras";
import type { FormExtras } from "@/lib/requestFormExtras";

function LimitedTextarea({ className = "", maxLength = 1000, value, onChange }: { className?: string, maxLength?: number, value?: string, onChange?: (val: string) => void }) {
 const [internalValue, setInternalValue] = useState(value || "");
 const remaining = maxLength - internalValue.length;

 useEffect(() => {
 if (value !== undefined) setInternalValue(value);
 }, [value]);

 return (
 <div className="flex flex-col w-full">
 <textarea
 className={`w-full bg-[#F4F3EF] border-none rounded-2xl p-4 text-sm text-gray-800 focus:ring-2 focus:ring-[var(--forest)] resize-none outline-none transition-shadow ${className}`}
 maxLength={maxLength}
 value={internalValue}
 onChange={(e) => {
 setInternalValue(e.target.value);
 if (onChange) onChange(e.target.value);
 }}
 />
 <div className={`text-right text-xs mt-1 transition-colors ${remaining === 0 ? "text-red-500 font-medium" : "text-gray-400"}`}>
 {remaining === 0 ? "0 characters left (limit reached)" : `${remaining} characters left`}
 </div>
 </div>
 );
}

// Reusable Field wrapper for unified labeling and spacing
function Field({ 
 label, 
 subtext, 
 children, 
 className = "" 
}: { 
 label: string; 
 subtext?: string; 
 children: React.ReactNode; 
 className?: string 
}) {
 return (
 <div className={`flex flex-col ${className}`}>
 <label className="block text-sm text-gray-600 mb-1.5">{label}</label>
 {children}
 {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
 </div>
 );
}

export default function EditRequestPage() {
 const { updateRequest } = useRequests();
 const router = useRouter();
 const params = useParams();
 const requestId = params.id as string;
 
 const [existingRequest, setExistingRequest] = useState<any>(null);
 const [isLoading, setIsLoading] = useState(true);

 useEffect(() => {
   if (requestId) {
     fetchLiveRequestById(requestId)
       .then(data => {
         setExistingRequest(data);
         setIsLoading(false);
       })
       .catch(err => {
         console.error("[requests/[id]/edit page] operation failed");
         setIsLoading(false);
       });
   }
 }, [requestId]);

 const TIMEZONE_MAP: Record<string, string> = {
 "Pacific Time — Seattle, Los Angeles": "America/Los_Angeles",
 "Mountain Time — Denver": "America/Denver",
 "Arizona (no daylight saving)": "America/Phoenix",
 "Central Time — Chicago": "America/Chicago",
 "Eastern Time — New York": "America/New_York",
 "Alaska Time": "America/Anchorage",
 "Hawaii Time": "Pacific/Honolulu"
 };

 const [extras, setExtras] = useState<FormExtras>(EMPTY_EXTRAS);
 const [showOtherPatientInfo, setShowOtherPatientInfo] = useState(false);
 const changeExtras = (field: keyof FormExtras, value: string | boolean) => setExtras((prev) => ({ ...prev, [field]: value }) as FormExtras);
 const [formData, setFormData] = useState({
 client: "New or one-time requester — no saved organization",
 requesterOrgOrContact: "New organization or contact",
 requesterName: "",
 requesterOrg: "",
 email: "",
 phone: "",
 prefContact: "No preference given",
 saveOrg: false,
 deafParticipant: "",
 peopleNeeding: "",
 commPreferences: "",
 setting: "Choose a setting",
 purpose: "",
 timeZone: "Pacific Time — Seattle, Los Angeles",
 startDate: "",
 startTime: "",
 endDate: "",
 endTime: "",
 modality: "In person",
 appointmentTitle: "",
 repeats: false,
 recurrenceNote: "",
 venue: "",
 address: "",
 building: "",
 onsiteContactName: "",
 onsiteContactPhone: "",
 parking: "",
 entrance: "",
 shortLabel: "",
 prefInterpreter: "",
 teamSuggested: "Not sure",
 qualifications: "",
 billOrg: "",
 billContact: "",
 billEmail: "",
 poNumber: "",
 prepNotes: "",
 privateNotes: "",
 positions: "One interpreter",
 program: "General",
 odhhSrn: "",
 odhhAccessCode: "",
 // A job saved before this setting existed has none on file, which counts as off.
 onsiteSignatureRequired: false,
 platform: "Zoom",
 meetingLink: "",
 meetingId: "",
 passcode: "",
 virtualInstructions: ""
 });

 useEffect(() => {
   if (existingRequest) {
     // The notes box shows what staff wrote; the person's details (Section 5) have their own fields.
     const loaded = extrasFromRequest(existingRequest?.data, existingRequest?.privateNotes);
     setExtras(loaded.extras);
     setShowOtherPatientInfo(loaded.extras.otherPatientInfo !== "");
     setFormData(prev => ({
       ...prev,
       requesterName: existingRequest?.requester?.name || "",
       requesterOrg: existingRequest?.requester?.org || "",
       email: existingRequest?.requester?.email || "",
       phone: existingRequest?.requester?.phone || "",
       prefContact: existingRequest?.requester?.prefContact || "No preference given",
       deafParticipant: existingRequest?.details?.deafParticipant || "",
       peopleNeeding: existingRequest?.details?.peopleNeeding || "",
       commPreferences: existingRequest?.details?.commPreferences || "",
       setting: existingRequest?.setting || "Choose a setting",
       purpose: existingRequest?.details?.purpose || "",
       timeZone: existingRequest?.details?.timeZone || "Pacific Time — Seattle, Los Angeles",
       modality: existingRequest?.details?.format || "In person",
       appointmentTitle: existingRequest?.title || "",
       repeats: Boolean(existingRequest?.repeats || existingRequest?.details?.repeats || existingRequest?.data?.repeats || existingRequest?.data?.details?.repeats),
       recurrenceNote: existingRequest?.recurrenceNote || existingRequest?.details?.recurrenceNote || existingRequest?.data?.recurrenceNote || existingRequest?.data?.details?.recurrenceNote || "",
       venue: existingRequest?.onsite?.venue || "",
       address: existingRequest?.onsite?.address || "",
       building: existingRequest?.onsite?.building || "",
       onsiteContactName: existingRequest?.onsite?.contact || "",
       onsiteContactPhone: existingRequest?.onsite?.contactMethod || "",
       parking: existingRequest?.onsite?.parking || "",
       entrance: existingRequest?.onsite?.entrance || "",
       prefInterpreter: existingRequest?.requester?.reqInterpreter || "",
       teamSuggested: existingRequest?.requester?.teamSuggested || "Not sure",
       qualifications: existingRequest?.details?.qualifications || "",
       billOrg: existingRequest?.requester?.billOrg || "",
       billContact: existingRequest?.requester?.billContact || "",
       billEmail: existingRequest?.requester?.billEmail || "",
       poNumber: existingRequest?.requester?.poNumber || "",
       prepNotes: existingRequest?.prepNotes || "",
       privateNotes: loaded.generalNotes,
       positions: positionsLabel(readPositions(existingRequest?.data ?? existingRequest).count),
       program: existingRequest?.data?.intake?.program || "General",
       odhhSrn: existingRequest?.data?.intake?.odhhSrn || "",
       odhhAccessCode: existingRequest?.data?.intake?.odhhAccessCode || "",
       onsiteSignatureRequired: existingRequest?.data?.onsiteSignatureRequired === true,
       platform: existingRequest?.platform || existingRequest?.details?.platform || "Zoom",
       meetingLink: existingRequest?.meetingLink || existingRequest?.details?.meetingLink || existingRequest?.virtualLink || existingRequest?.details?.virtualLink || "",
       meetingId: existingRequest?.meetingId || existingRequest?.details?.meetingId || "",
       passcode: existingRequest?.passcode || existingRequest?.details?.passcode || existingRequest?.accessCode || existingRequest?.details?.accessCode || "",
       virtualInstructions: existingRequest?.virtualInstructions || existingRequest?.details?.virtualInstructions || ""
     }));
   }
 }, [existingRequest]);

  useEffect(() => {
    if (existingRequest?.startsAt && existingRequest?.endsAt) {
      try {
        const ianaTz = getIanaZone(existingRequest?.details?.timeZone || existingRequest?.timeZone);
        const startUTC = new Date(existingRequest.startsAt);
        const endUTC = new Date(existingRequest.endsAt);

        const startDate = formatInTimeZone(startUTC, ianaTz, "yyyy-MM-dd");
        const startTime = formatInTimeZone(startUTC, ianaTz, "HH:mm");
        const endDate = formatInTimeZone(endUTC, ianaTz, "yyyy-MM-dd");
        const endTime = formatInTimeZone(endUTC, ianaTz, "HH:mm");

        setFormData(prev => ({
          ...prev,
          startDate,
          startTime,
          endDate,
          endTime
        }));
      } catch (e) {
        console.error("Error prefilling dates in timezone:");
      }
    }
  }, [existingRequest]);


  const [dbClients, setDbClients] = useState<ClientWithStats[]>([]);

  useEffect(() => {
    getClientsAction().then(data => {
      setDbClients(data.filter(c => !c.isArchived));
    }).catch(() => console.error("[requests/[id]/edit page] request failed"));
  }, []);

  const requesterOptions = React.useMemo(() => {
    const list: Array<{
      label: string;
      organization: string;
      contactName: string;
      email: string;
      phone: string;
      preferredContact?: string;
      billingOrg?: string;
      defaultLocation?: any;
    }> = [];

    dbClients.forEach(c => {
      const reqContacts = (c.contacts || []).filter(co => co.type === "Requester contact" && !co.isArchived);
      const defLoc = (c.locations || []).find(l => l.isDefault && !l.isArchived) || (c.locations || [])[0];

      if (reqContacts.length > 0) {
        reqContacts.forEach(rc => {
          list.push({
            label: `${c.name} · ${rc.name}`,
            organization: c.name,
            contactName: rc.name,
            email: rc.email || c.generalEmail || "",
            phone: rc.phone || c.generalPhone || "",
            billingOrg: c.billingOrg || c.name,
            preferredContact: "No preference given",
            defaultLocation: defLoc
          });
        });
      } else {
        list.push({
          label: c.name,
          organization: c.name,
          contactName: c.name,
          email: c.generalEmail || "",
          phone: c.generalPhone || "",
          billingOrg: c.billingOrg || c.name,
          preferredContact: "No preference given",
          defaultLocation: defLoc
        });
      }
    });

    return list;
  }, [dbClients]);

  const hasAutoMatchedClientRef = useRef(false);

  useEffect(() => {
    if (!existingRequest || dbClients.length === 0 || hasAutoMatchedClientRef.current) return;
    hasAutoMatchedClientRef.current = true;
    // A one-time requester (e.g. the ODHH requestor from an intake email) keeps its own contact: never replaced by a
    // saved client's default contact just because the organisation name matches.
    if (existingRequest?.requester?.oneTime) return;

    const reqOrg = (
      existingRequest?.requester?.org ||
      existingRequest?.data?.requester?.org ||
      existingRequest?.client ||
      existingRequest?.data?.client ||
      ""
    ).trim();

    const reqContactName = (
      existingRequest?.requester?.name ||
      existingRequest?.data?.requester?.name ||
      ""
    ).trim();

    const reqContactEmail = (
      existingRequest?.requester?.email ||
      existingRequest?.data?.requester?.email ||
      ""
    ).trim();

    if (!reqOrg) return;

    const matchedClient = dbClients.find(
      c => c.name.trim().toLowerCase() === reqOrg.toLowerCase()
    );

    if (matchedClient) {
      const matchedContact = (matchedClient.contacts || []).find(co => {
        const nameMatch = reqContactName && co.name.trim().toLowerCase() === reqContactName.toLowerCase();
        const emailMatch = reqContactEmail && co.email.trim().toLowerCase() === reqContactEmail.toLowerCase();
        return nameMatch || emailMatch;
      });

      let selectedRequesterOption = "";
      if (matchedContact) {
        selectedRequesterOption = `${matchedClient.name} · ${matchedContact.name}`;
      } else {
        const optionForClient = requesterOptions.find(ro => ro.organization.toLowerCase() === matchedClient.name.toLowerCase());
        if (optionForClient) {
          selectedRequesterOption = optionForClient.label;
        } else {
          selectedRequesterOption = matchedClient.name;
        }
      }

      setFormData(prev => ({
        ...prev,
        client: matchedClient.name,
        requesterOrgOrContact: selectedRequesterOption || prev.requesterOrgOrContact,
        saveOrg: false
      }));
    }
  }, [existingRequest, dbClients, requesterOptions]);

  const [confirmDuplicateOrg, setConfirmDuplicateOrg] = useState(false);

  const isNewRequester = 
    !formData.requesterOrgOrContact || 
    formData.requesterOrgOrContact === "New organization or contact" ||
    formData.requesterOrgOrContact.trim() === "" ||
    formData.requesterOrgOrContact.startsWith("New ") ||
    !formData.client ||
    formData.client === "New or one-time requester — no saved organization" ||
    formData.client.trim() === "" ||
    formData.client.startsWith("New ");

  const duplicateClient = React.useMemo(() => {
    if (!isNewRequester || !formData.saveOrg) {
      return null;
    }
    const org = (formData.requesterOrg || "").trim();
    if (!org) return null;
    return dbClients.find(c => c.name.trim().toLowerCase() === org.toLowerCase()) || null;
  }, [isNewRequester, formData.saveOrg, formData.requesterOrg, dbClients]);

  useEffect(() => {
    setConfirmDuplicateOrg(false);
  }, [formData.requesterOrg, formData.saveOrg, formData.requesterOrgOrContact]);

  const isDuplicateUnconfirmed = Boolean(duplicateClient && !confirmDuplicateOrg);

  const realOffers = existingRequest?.offers || [];
  // Same rule as offerLock.ts (enforced again on the server): a live offer locks; a booking locks only once the
  // appointment has started. A booked future job can be edited, and the booked interpreter is emailed what changed.
  const nowMs = Date.now();
  const apptStartMs = new Date(existingRequest?.startsAt ?? Number.NaN).getTime();
  const apptEndMs = new Date(existingRequest?.endsAt ?? Number.NaN).getTime();
  const hasLivePendingOffer = realOffers.some((o: any) =>
    (o.state || o.status) === 'pending' && new Date(o.expiresAt).getTime() > nowMs && !(apptEndMs < nowMs)
  );
  const isBookedRequest = realOffers.some((o: any) => (o.state || o.status) === 'accepted') ||
    ['assigned', 'booked', 'Fully staffed'].includes(existingRequest?.status);
  const isCancelledRequest = ['Cancelled', 'cancelled'].includes(existingRequest?.status);
  const isEditLocked = isCancelledRequest || hasLivePendingOffer || (isBookedRequest && !Number.isNaN(apptStartMs) && nowMs >= apptStartMs);
  // While an interpreter is booked, date, time, time zone and program are fixed (the server ignores them too).
  const isScheduleLocked = isBookedRequest && !isEditLocked;
  const [messageToInterpreter, setMessageToInterpreter] = useState("");
  // Team jobs: the message goes to one booked interpreter (the one being replied to), never the whole team.
  const messageRecipients = bookedRecipients(realOffers, readPositions(existingRequest?.data ?? existingRequest).ids);
  const [messageRecipient, setMessageRecipient] = useState("");
  const recipientDefault = defaultRecipient(messageRecipients, existingRequest?.data?.clarifications);
  useEffect(() => {
    setMessageRecipient((current) => current || recipientDefault);
  }, [recipientDefault]);
  const needsRecipient = isScheduleLocked && Boolean(messageToInterpreter.trim()) && messageRecipients.length > 1 && !messageRecipient;
  const editLockMessage = isCancelledRequest
    ? "This appointment was cancelled, so it can't be edited."
    : hasLivePendingOffer
      ? "This appointment can't be edited while an offer is waiting for a response. Once every pending offer has been accepted, declined or has expired, you can edit it."
      : "This appointment has already started, so its booked details can no longer be edited.";

  const handleChange = (field: keyof typeof formData, value: string | boolean) => {
    if (field === "requesterOrgOrContact") {
      if (value === "New organization or contact") {
        setFormData(prev => ({
          ...prev,
          requesterOrgOrContact: value as string,
          client: "New or one-time requester — no saved organization",
          saveOrg: false
        }));
        return;
      }
      const matched = requesterOptions.find(r => r.label === value);
      if (matched) {
        setFormData(prev => ({
          ...prev,
          client: matched.organization,
          requesterOrgOrContact: value as string,
          requesterOrg: matched.organization,
          requesterName: matched.contactName,
          email: matched.email,
          phone: matched.phone,
          prefContact: matched.preferredContact || "No preference given",
          billOrg: matched.billingOrg || matched.organization,
          venue: matched.defaultLocation?.name || prev.venue,
          address: matched.defaultLocation?.streetAddress || matched.defaultLocation?.address || prev.address,
          building: matched.defaultLocation?.roomOrSuite || matched.defaultLocation?.room || prev.building,
          parking: matched.defaultLocation?.parking || prev.parking,
          entrance: matched.defaultLocation?.entrance || prev.entrance,
          saveOrg: false
        }));
        return;
      }
    }

    if (field === "client") {
      if (value === "New or one-time requester — no saved organization") {
        setFormData(prev => ({
          ...prev,
          client: value as string,
          requesterOrgOrContact: "New organization or contact",
          saveOrg: false
        }));
        return;
      }
      const matchedClient = dbClients.find(c => c.name === value);
      if (matchedClient) {
        const reqContacts = (matchedClient.contacts || []).filter(co => co.type === "Requester contact" && !co.isArchived);
        const defContact = reqContacts.find(co => co.isDefault) || reqContacts[0]
          || (matchedClient.contacts || []).find(co => co.isDefault && !co.isArchived)
          || (matchedClient.contacts || []).find(co => !co.isArchived)
          || (matchedClient.contacts || [])[0];

        const defLoc = (matchedClient.locations || []).find(l => l.isDefault && !l.isArchived)
          || (matchedClient.locations || []).find(l => !l.isArchived)
          || (matchedClient.locations || [])[0];

        const matchingOption = defContact
          ? requesterOptions.find(ro => ro.organization.toLowerCase() === matchedClient.name.toLowerCase() && ro.contactName.toLowerCase() === defContact.name.toLowerCase())
          : requesterOptions.find(ro => ro.organization.toLowerCase() === matchedClient.name.toLowerCase());

        const selectedRequesterOption = matchingOption
          ? matchingOption.label
          : (defContact ? `${matchedClient.name} · ${defContact.name}` : matchedClient.name);

        setFormData(prev => ({
          ...prev,
          client: value as string,
          requesterOrgOrContact: selectedRequesterOption,
          requesterOrg: matchedClient.name,
          requesterName: defContact?.name || matchedClient.name,
          email: defContact?.email || matchedClient.generalEmail || "",
          phone: defContact?.phone || matchedClient.generalPhone || "",
          billOrg: (matchedClient as any).billingOrganization || matchedClient.billingOrg || matchedClient.name,
          venue: defLoc?.name || prev.venue,
          address: defLoc?.streetAddress || defLoc?.address || prev.address,
          building: defLoc?.roomOrSuite || defLoc?.room || prev.building,
          parking: defLoc?.parking || prev.parking,
          entrance: defLoc?.entrance || prev.entrance,
          saveOrg: false
        }));
        return;
      }
    }

    if (field === "timeZone") {
      const oldTz = getIanaZone(formData.timeZone);
      const newTz = getIanaZone(value as string);

      try {
        if (formData.startDate && formData.startTime && formData.endDate && formData.endTime) {
          const startUTC = fromZonedTime(`${formData.startDate}T${formData.startTime}:00`, oldTz);
          const endUTC = fromZonedTime(`${formData.endDate}T${formData.endTime}:00`, oldTz);

          setFormData(prev => ({
            ...prev,
            timeZone: value as string,
            startDate: formatInTimeZone(startUTC, newTz, "yyyy-MM-dd"),
            startTime: formatInTimeZone(startUTC, newTz, "HH:mm"),
            endDate: formatInTimeZone(endUTC, newTz, "yyyy-MM-dd"),
            endTime: formatInTimeZone(endUTC, newTz, "HH:mm")
          }));
          return;
        }
      } catch (e) {
        console.error("Error adjusting timezone in edit:");
      }
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const getHelperText = (dateStr: string, timeStr: string, timeZoneLabel: string) => {
    if (!dateStr || !timeStr) return "";
    try {
      const ianaTz = getIanaZone(timeZoneLabel);
      const utcDate = fromZonedTime(`${dateStr}T${timeStr}:00`, ianaTz);

      const fShort = new Intl.DateTimeFormat('en-US', { timeZone: ianaTz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      const fOffset = new Intl.DateTimeFormat('en-US', { timeZone: ianaTz, timeZoneName: 'longOffset' });

      const timeAndAbbrev = fShort.format(utcDate);
      const offsetPart = fOffset.formatToParts(utcDate).find(p => p.type === 'timeZoneName')?.value || ""; 
      const utcOffset = offsetPart.replace('GMT', 'UTC'); 

      return `${timeAndAbbrev} - ${timeZoneLabel} (${utcOffset})`;
    } catch (e) {
      return "";
    }
  };

  let isTimeInvalid = false;
  if (formData.startDate && formData.startTime && formData.endDate && formData.endTime) {
    try {
      const ianaTz = getIanaZone(formData.timeZone);
      const startUtc = fromZonedTime(`${formData.startDate}T${formData.startTime}:00`, ianaTz);
      const endUtc = fromZonedTime(`${formData.endDate}T${formData.endTime}:00`, ianaTz);
      isTimeInvalid = endUtc.getTime() <= startUtc.getTime();
    } catch (e) {
      isTimeInvalid = new Date(`${formData.startDate}T${formData.startTime}`) >= new Date(`${formData.endDate}T${formData.endTime}`);
    }
  }

  const isEmailInvalid = isInvalidEmail(formData.email);
  const isBillEmailInvalid = isInvalidEmail(formData.billEmail);
  const isAnyEmailInvalid = isEmailInvalid || isBillEmailInvalid;

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (isEditLocked || isTimeInvalid || isDuplicateUnconfirmed || isAnyEmailInvalid || needsRecipient) return;
    setIsSaving(true);
    try {
      const { startsAt: startsAtStr, endsAt: endsAtStr } = buildAppointmentUtcTimes({
        date: formData.startDate,
        startTime: formData.startTime,
        endDate: formData.endDate,
        endTime: formData.endTime,
        timeZone: formData.timeZone,
      });

      const extrasPayload = buildExtrasPayload(extras, formData.privateNotes, String(existingRequest?.privateNotes ?? ""), "edit");
      const updatedRequest = {
        title: formData.appointmentTitle || "Interpreting request",
        client: formData.client,
        setting: formData.setting,
        startDate: formData.startDate,
        startTime: formData.startTime,
        endDate: formData.endDate,
        endTime: formData.endTime,
        timeZone: formData.timeZone,
        startsAt: startsAtStr,
        endsAt: endsAtStr,
        repeats: Boolean(formData.repeats),
        recurrenceNote: formData.repeats ? (formData.recurrenceNote || "") : "",
        overview: {
          location: formData.venue || "TBD",
          reference: existingRequest.id,
          status: existingRequest.status,
          startsAt: startsAtStr,
          endsAt: endsAtStr
        },
        details: {
          setting: formData.setting,
          purpose: formData.purpose,
          format: formData.modality,
          timeZone: formData.timeZone,
          timezone: formData.timeZone,
          startDate: formData.startDate,
          startTime: formData.startTime,
          endDate: formData.endDate,
          endTime: formData.endTime,
          startsAt: startsAtStr,
          endsAt: endsAtStr,
          customStartsAt: startsAtStr,
          customEndsAt: endsAtStr,
          deafParticipant: formData.deafParticipant,
          peopleNeeding: formData.peopleNeeding,
          commPreferences: formData.commPreferences,
          qualifications: formData.qualifications,
          repeats: Boolean(formData.repeats),
          recurrenceNote: formData.repeats ? (formData.recurrenceNote || "") : "",
          positions: formData.positions,
          requiredPositions: countFromLabel(formData.positions) ?? 1,
          slotCount: countFromLabel(formData.positions) ?? 1,
          // Virtual Meeting Details (same fields and keys as Quick Edit).
          platform: formData.platform,
          meetingLink: formData.meetingLink,
          virtualLink: formData.meetingLink,
          meetingId: formData.meetingId,
          passcode: formData.passcode,
          accessCode: formData.passcode,
          virtualInstructions: formData.virtualInstructions,
        },
        onsite: {
          venue: formData.venue,
          address: formData.address,
          building: formData.building,
          parking: formData.parking,
          entrance: formData.entrance,
          contact: formData.onsiteContactName,
          contactMethod: formData.onsiteContactPhone,
          ...extrasPayload.onsite
        },
        requester: {
          name: formData.requesterName,
          org: formData.requesterOrg,
          email: formData.email,
          phone: formData.phone,
          prefContact: formData.prefContact,
          reqInterpreter: formData.prefInterpreter,
          teamSuggested: formData.teamSuggested,
          billOrg: formData.billOrg,
          billContact: formData.billContact,
          billEmail: formData.billEmail,
          poNumber: formData.poNumber,
          // Keep (or drop, once a saved client is chosen) the one-time flag set by the intake.
          ...(existingRequest?.requester?.oneTime ? { oneTime: isNewRequester } : {})
        },
        prepNotes: formData.prepNotes,
        privateNotes: extrasPayload.privateNotes,
        messageToInterpreter: isScheduleLocked ? messageToInterpreter : undefined,
        messageRecipientId: isScheduleLocked && messageRecipient ? messageRecipient : undefined,
        activity: "updated just now",
        positions: formData.positions,
        requiredPositions: countFromLabel(formData.positions) ?? 1,
        slotCount: countFromLabel(formData.positions) ?? 1,
        data: {
          client: formData.client,
          startsAt: startsAtStr,
          endsAt: endsAtStr,
          customStartsAt: startsAtStr,
          customEndsAt: endsAtStr,
          positions: formData.positions,
          requiredPositions: countFromLabel(formData.positions) ?? 1,
          slotCount: countFromLabel(formData.positions) ?? 1,
          repeats: Boolean(formData.repeats),
          recurrenceNote: formData.repeats ? (formData.recurrenceNote || "") : "",
          // The server re-resolves this (off for a state job, frozen once hours exist), so this is only the staff's choice.
          onsiteSignatureRequired: formData.onsiteSignatureRequired,
          // Only the hearing identity (Patient Information card); the server keeps every other saved brief key.
          brief: extrasPayload.brief,
          intake: {
            program: formData.program,
            ...programIdentifiers(formData),
            ...extrasPayload.intake,
            positions: formData.positions,
            requiredPositions: countFromLabel(formData.positions) ?? 1,
            slotCount: countFromLabel(formData.positions) ?? 1,
          }
        }
      };

      // 1. Persist to PostgreSQL database and revalidate server paths
      const saved = await updateRequestAction(requestId, updatedRequest);
      if (!saved.success) {
        // The server refuses edits while offers are live or an interpreter is booked; show why and stay here.
        setSaveError(saved.error);
        setIsSaving(false);
        return;
      }

      if (formData.saveOrg && isNewRequester) {
        await saveRequesterToClientsAction({
          organization: formData.requesterOrg,
          contactName: formData.requesterName,
          email: formData.email,
          phone: formData.phone,
          preferredContact: formData.prefContact
        });
      }

      // 2. Sync React Context / localStorage
      updateRequest(requestId, updatedRequest);

      // 3. Sync interpreter jobs localStorage if present
      if (typeof window !== 'undefined') {
        try {
          const storedJobs = JSON.parse(localStorage.getItem('terpdesk_interpreter_jobs') || '[]');
          const idx = storedJobs.findIndex((j: any) => String(j.id) === String(requestId) || String(j.requestId) === String(requestId));
          if (idx > -1) {
            storedJobs[idx] = {
              ...storedJobs[idx],
              title: updatedRequest.title,
              startsAt: startsAtStr,
              endsAt: endsAtStr,
              setting: formData.setting,
              format: formData.modality,
              details: {
                ...storedJobs[idx].details,
                ...updatedRequest.details,
                startsAt: startsAtStr,
                endsAt: endsAtStr,
              }
            };
            localStorage.setItem('terpdesk_interpreter_jobs', JSON.stringify(storedJobs));
          }
        } catch (e) {
          console.error("[requests/[id]/edit page] operation failed");
        }
      }

      router.push(`/requests/${requestId}`);
    } catch (err) {
      console.error("Failed to save request:");
      setSaveError("We could not save your changes. Please try again.");
      setIsSaving(false);
    }
  };

 const inputClass = "w-full bg-[#F4F3EF] border-none rounded-full px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[var(--forest)] outline-none transition-shadow appearance-none";
 const lockedInputClass = `${inputClass} opacity-70 cursor-not-allowed`;
 const textareaClass = "w-full bg-[#F4F3EF] border-none rounded-2xl p-4 text-sm text-gray-800 focus:ring-2 focus:ring-[var(--forest)] resize-none outline-none transition-shadow";
 const cardClass = "bg-white rounded-2xl border border-gray-200 p-6 border border-gray-200/50 shadow-none space-y-6";
 const sectionTitleClass = "text-[18px] font-medium text-[var(--ink)] mb-4";

 if (isLoading) {
 return (
 <div className="max-w-[1200px] mx-auto p-6 flex flex-col items-center justify-center h-[50vh]">
 <h1 className="text-2xl font-bold text-gray-800 mb-4">Loading request...</h1>
 </div>
 );
 }

 if (!existingRequest) {
 return (
 <div className="max-w-[1200px] mx-auto p-6 flex flex-col items-center justify-center h-[50vh]">
 <h1 className="text-2xl font-bold text-gray-800 mb-4">Request not found</h1>
 <button onClick={() => router.push("/dashboard")} className="bg-[var(--forest)] text-[var(--canvas)] px-6 py-2.5 rounded-full font-medium transition-opacity hover:opacity-90">
 Return to dashboard
 </button>
 </div>
 );
 }

 return (
 <div className="max-w-[1200px] mx-auto p-6 space-y-6 pb-24 antialiased">
 {/* Header */}
 <div className="space-y-2 mb-8">
 <h1 className="text-[28px] font-medium tracking-tight text-[var(--ink)]">Edit request</h1>
 <p className="text-[15px] text-[var(--sage)]">
 Update the details for this assignment.
 </p>
 {isEditLocked && (
 <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm flex items-center gap-2.5">
 <Lock className="w-4 h-4 flex-shrink-0 text-amber-700" />
 <span>{editLockMessage}</span>
 </div>
 )}
 {!isEditLocked && isBookedRequest && (
 <div className="mt-4 bg-sky-50 border border-sky-200 text-sky-900 rounded-xl p-4 text-sm">
 An interpreter is booked on this job, so the date, time, time zone and program are locked. You can still edit the location, contacts, notes and credentials. When you save, each booked interpreter is emailed exactly what changed (plus an optional message from you), and the job is marked “Updated” in their app.
 </div>
 )}
 </div>

 {/* Client Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Organization</h2>
 <Field 
 label="Requesting organization on file"
 subtext="A saved organization is optional. Nothing is merged automatically by name or email, and no login is created."
 >
 <CustomSelect 
   options={["New or one-time requester — no saved organization", ...dbClients.map(c => c.name)]} 
   value={formData.client} 
   onChange={(val) => handleChange("client", val)} 
 />
 </Field>
 </div>

 {/* Requester Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Requester</h2>
 <Field 
 label="Requesting organization or contact on file"
 subtext="Choosing an existing record fills the fields below. Nothing is merged automatically and no login is created for requesters."
 >
 <CustomSelect 
 options={["New organization or contact", ...requesterOptions.map(r => r.label)]} 
 value={formData.requesterOrgOrContact} 
 onChange={(val) => handleChange("requesterOrgOrContact", val)} 
 />
 </Field>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
 <Field label="Requester name">
 <input type="text" className={inputClass} value={formData.requesterName} onChange={(e) => handleChange("requesterName", e.target.value)} />
 </Field>
 <Field label="Organization or department">
 <input type="text" className={inputClass} value={formData.requesterOrg} onChange={(e) => handleChange("requesterOrg", e.target.value)} />
 </Field>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
 <Field label="Email">
 <input 
   type="email" 
   className={`${inputClass} ${isEmailInvalid ? "ring-2 ring-red-500 border-red-500" : ""}`} 
   value={formData.email} 
   onChange={(e) => handleChange("email", e.target.value)} 
 />
 {isEmailInvalid && (
   <p className="text-xs text-red-600 mt-1 font-medium">
     Please enter a valid email address (e.g., name@organization.org).
   </p>
 )}
 </Field>
 <Field label="Phone">
 <input type="tel" className={inputClass} value={formData.phone} onChange={(e) => handleChange("phone", e.target.value)} />
 </Field>
 </div>

 <div className="mt-6">
 <Field label="Preferred contact method">
 <CustomSelect options={["No preference given", "Email", "Phone call", "Text message"]} value={formData.prefContact} onChange={(val) => handleChange("prefContact", val)} />
 </Field>
 </div>
 </div>

 {/* Checkbox Outside Cards */}
 {isNewRequester && (
 <div className="space-y-3 px-2 py-2">
 <div className="flex items-center gap-3">
 <input 
 type="checkbox" 
 id="edit-save-org-checkbox"
 className="h-5 w-5 rounded border-gray-300 text-[var(--forest)] focus:ring-[var(--forest)]" 
 checked={formData.saveOrg as boolean}
 onChange={(e) => handleChange("saveOrg", e.target.checked)}
 />
 <label htmlFor="edit-save-org-checkbox" className="text-[15px] text-gray-700 font-medium cursor-pointer">
 Save this organization and contact to the agency list for future requests
 </label>
 </div>

 {duplicateClient && (
 <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 space-y-3">
 <div className="flex items-start gap-2.5">
 <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
 <p className="text-sm font-medium leading-snug">
 Warning: &apos;{duplicateClient.name}&apos; is already in your Clients list. Saving will add/update this contact under the existing client. Are you sure?
 </p>
 </div>
 <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
 <button
 type="button"
 onClick={() => {
   const clientOption = requesterOptions.find(ro => ro.organization.toLowerCase() === duplicateClient.name.toLowerCase());
   if (clientOption) {
     handleChange("requesterOrgOrContact", clientOption.label);
   } else {
     handleChange("client", duplicateClient.name);
     handleChange("requesterOrgOrContact", duplicateClient.name);
   }
   setFormData(prev => ({ ...prev, saveOrg: false }));
   setConfirmDuplicateOrg(false);
 }}
 className="px-3.5 py-1.5 bg-white border border-red-300 hover:bg-red-100 text-red-800 rounded-lg text-xs font-semibold shadow-sm transition-colors text-left sm:text-center"
 >
 Use existing &apos;{duplicateClient.name}&apos; from Clients
 </button>
 <label className="flex items-center gap-2 text-xs text-red-800 cursor-pointer font-medium select-none">
 <input
 type="checkbox"
 checked={confirmDuplicateOrg}
 onChange={(e) => setConfirmDuplicateOrg(e.target.checked)}
 className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
 />
 <span>Yes, I&apos;m sure — save/update under this existing organization</span>
 </label>
 </div>
 </div>
 )}
 </div>
 )}

 {/* Client and setting Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Client and setting</h2>
 
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
 <Field label="Deaf or hard of hearing client" subtext="Shared with the interpreter once they are booked on the job (never on an offer, never in an email).">
 <input type="text" className={inputClass} value={formData.deafParticipant} onChange={(e) => handleChange("deafParticipant", e.target.value)} />
 </Field>
 <Field label="Number of clients needing interpreting">
 <input type="text" className={inputClass} value={formData.peopleNeeding} onChange={(e) => handleChange("peopleNeeding", e.target.value)} />
 </Field>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
 <Field label="Communication preferences (optional)">
 <input type="text" className={inputClass} value={formData.commPreferences} onChange={(e) => handleChange("commPreferences", e.target.value)} />
 </Field>
 <Field label="Setting">
 <CustomSelect options={["Choose a setting", "Education", "Medical", "Workplace", "Legal", "Community", "Other"]} value={formData.setting} onChange={(val) => handleChange("setting", val)} />
 </Field>
 </div>

 <div className="mt-6">
 <Field 
 label="Purpose or context of the appointment"
 subtext="Describe what the appointment is for and what interpreters should expect. Do not include diagnoses, medical history or identifiers such as dates of birth or record numbers."
 >
 <textarea className={`${textareaClass} min-h-[120px]`} value={formData.purpose} onChange={(e) => handleChange("purpose", e.target.value)} />
 </Field>
 </div>
 </div>

 {/* Schedule and modality Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Schedule and modality</h2>
 {isScheduleLocked && (
 <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
 <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
 <span>The date, time and time zone are locked because an interpreter is booked. Changing them would skip the availability check they were booked under. To move the appointment, remove the booking first.</span>
 </div>
 )}
 
 <Field label="Appointment time zone" subtext="Times are entered in the appointment time zone, not your computer's location.">
 <CustomSelect disabled={isScheduleLocked} options={["Pacific Time — Seattle, Los Angeles", "Mountain Time — Denver", "Arizona (no daylight saving)", "Central Time — Chicago", "Eastern Time — New York", "Alaska Time", "Hawaii Time"]} value={formData.timeZone} onChange={(val) => handleChange("timeZone", val)} />
 </Field>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-6">
 <Field label="Starts" subtext={getHelperText(formData.startDate, formData.startTime, formData.timeZone)}>
 <div className="flex flex-col sm:flex-row gap-2">
 <IconInput kind="date" disabled={isScheduleLocked} className={isScheduleLocked ? lockedInputClass : inputClass} value={formData.startDate} onChange={(e) => handleChange("startDate", e.target.value)} />
 <IconInput kind="time" disabled={isScheduleLocked} className={isScheduleLocked ? lockedInputClass : inputClass} value={formData.startTime} onChange={(e) => handleChange("startTime", e.target.value)} />
 </div>
 </Field>
 <Field label="Ends" subtext={getHelperText(formData.endDate, formData.endTime, formData.timeZone)}>
 <div className="flex flex-col sm:flex-row gap-2">
 <IconInput kind="date" disabled={isScheduleLocked} className={isScheduleLocked ? lockedInputClass : inputClass} value={formData.endDate} onChange={(e) => handleChange("endDate", e.target.value)} />
 <IconInput kind="time" disabled={isScheduleLocked} className={isScheduleLocked ? lockedInputClass : inputClass} value={formData.endTime} onChange={(e) => handleChange("endTime", e.target.value)} />
 </div>
 </Field>
 </div>

 {isTimeInvalid && (
 <div className="text-red-600 text-sm mt-2 font-medium">
 The end time must be after the start time.
 </div>
 )}

 <div className="mt-6">
 <Field label="How will interpreting happen?">
 <CustomSelect options={["In person", "Virtual", "Hybrid — in person and virtual"]} value={formData.modality} onChange={(val) => handleChange("modality", val)} />
 </Field>
 </div>

 <div className="mt-6">
 <Field 
 label="Appointment title (optional)" 
 subtext="Left blank, the title becomes “Interpreting request”. Client names are not added to titles."
 >
 <input type="text" className={inputClass} value={formData.appointmentTitle} onChange={(e) => handleChange("appointmentTitle", e.target.value)} />
 </Field>
 </div>

 <div className="flex items-center gap-3 mt-6">
 <input 
 type="checkbox" 
 className="h-5 w-5 rounded border-gray-300 text-[var(--forest)] focus:ring-[var(--forest)]" 
 checked={formData.repeats as boolean}
 onChange={(e) => handleChange("repeats", e.target.checked)}
 />
 <span className="text-[15px] text-gray-700">This repeats</span>
 </div>

 {Boolean(formData.repeats) && (
 <div className="mt-4">
 <Field 
 label="Describe the repeating pattern" 
 subtext="Recorded for staff follow-up only. Repeating appointments are not created automatically."
 >
 <LimitedTextarea 
 className="min-h-[100px]" 
 maxLength={1000} 
 value={formData.recurrenceNote} 
 onChange={(val) => handleChange("recurrenceNote", val)} 
 />
 </Field>
 </div>
 )}
 </div>

 {/* Virtual Meeting Details (same fields as the Quick Edit modal) */}
 {isVirtualFormat(formData.modality) && (
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Virtual meeting details</h2>
 <VirtualMeetingFields
 values={{ platform: formData.platform, meetingLink: formData.meetingLink, meetingId: formData.meetingId, passcode: formData.passcode, virtualInstructions: formData.virtualInstructions }}
 onChange={(field, value) => handleChange(field, value)}
 />
 </div>
 )}

 {/* Location details: shown for every format, because a virtual or hybrid job can still have a place to go */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Location details</h2>
 
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
 <Field label="Venue or facility">
 <input type="text" className={inputClass} value={formData.venue} onChange={(e) => handleChange("venue", e.target.value)} />
 </Field>
 <Field label="Street address">
 <input type="text" className={inputClass} value={formData.address} onChange={(e) => handleChange("address", e.target.value)} />
 </Field>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
 <Field label="Building">
 <input type="text" className={inputClass} value={formData.building} onChange={(e) => handleChange("building", e.target.value)} />
 </Field>
 <Field label="Onsite contact name">
 <input type="text" className={inputClass} value={formData.onsiteContactName} onChange={(e) => handleChange("onsiteContactName", e.target.value)} />
 </Field>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
 <Field label="Onsite contact phone or email">
 <input type="text" className={inputClass} value={formData.onsiteContactPhone} onChange={(e) => handleChange("onsiteContactPhone", e.target.value)} />
 </Field>
 </div>

  <RoomFloorFields floor={extras.floor} room={extras.room} onChange={(field, value) => changeExtras(field, value)} />

 <RoomFloorFields floor={extras.floor} room={extras.room} onChange={(field, value) => changeExtras(field, value)} />

 <div className="mt-6">
 <Field label="Direction & Parking Note" subtext="Directions, door or gate codes, where to park. Shared with the booked interpreter.">
 <textarea className={`${textareaClass} min-h-[100px]`} value={formData.parking} onChange={(e) => handleChange("parking", e.target.value)} />
 </Field>
 </div>

 <div className="mt-6">
 <Field label="Entrance and check-in instructions">
 <textarea className={`${textareaClass} min-h-[100px]`} value={formData.entrance} onChange={(e) => handleChange("entrance", e.target.value)} />
 </Field>
 </div>
 </div>

 {/* Short location label Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Short location label</h2>
 <Field label="Shown in lists and on the calendar">
 <input type="text" className={inputClass} value={formData.shortLabel} onChange={(e) => handleChange("shortLabel", e.target.value)} />
 </Field>
 </div>

 {/* Interpreter requirements Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Interpreter requirements</h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
 <Field label="Preferred interpreter (a request, not a guarantee)">
 <input type="text" className={inputClass} value={formData.prefInterpreter} onChange={(e) => handleChange("prefInterpreter", e.target.value)} />
 </Field>
 <Field label="Suggested team requirement">
 <CustomSelect options={["Not sure", "One interpreter", "Team of two"]} value={formData.teamSuggested} onChange={(val) => handleChange("teamSuggested", val)} />
 </Field>
 </div>
 <div className="mt-6">
 <Field 
 label="Qualification or communication needs"
 subtext="A suggestion only. Staff decide the required interpreter positions for this job; nothing about staffing or credentials is applied automatically."
 >
 <textarea className={`${textareaClass} min-h-[100px]`} value={formData.qualifications} onChange={(e) => handleChange("qualifications", e.target.value)} />
 </Field>
 </div>
 </div>

 {/* Billing contact and references Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Billing contact and references</h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
 <Field label="Organization responsible for payment">
 <input type="text" className={inputClass} value={formData.billOrg} onChange={(e) => handleChange("billOrg", e.target.value)} />
 </Field>
 <Field label="Billing contact name">
 <input type="text" className={inputClass} value={formData.billContact} onChange={(e) => handleChange("billContact", e.target.value)} />
 </Field>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
 <Field 
 label="Billing contact email"
 subtext="Recorded for reference only. This does not set rates, start billing or confirm who pays."
 >
 <input 
   type="email" 
   className={`${inputClass} ${isBillEmailInvalid ? "ring-2 ring-red-500 border-red-500" : ""}`} 
   value={formData.billEmail} 
   onChange={(e) => handleChange("billEmail", e.target.value)} 
 />
 {isBillEmailInvalid && (
   <p className="text-xs text-red-600 mt-1 font-medium">
     Please enter a valid email address (e.g., name@organization.org).
   </p>
 )}
 </Field>
 <Field label="Purchase order or reference number (optional)">
 <input type="text" className={inputClass} value={formData.poNumber} onChange={(e) => handleChange("poNumber", e.target.value)} />
 </Field>
 </div>
 </div>

 <RequestFlagsCard isPublic={extras.isPublic} isMixedGroup={extras.isMixedGroup} requestedInterpreter={extras.requestedInterpreter} onChange={changeExtras} />

 {/* Program and state identifiers Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Program and state identifiers</h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
 <Field label="Funding program" subtext={isScheduleLocked ? "Locked while an interpreter is booked: it decides how the job is reported." : undefined}>
 <CustomSelect disabled={isScheduleLocked} options={["General", "WA ODHH", "WA Apple Health"]} value={formData.program} onChange={(val) => handleChange("program", val)} />
 </Field>
 {(formData.program === "WA ODHH" || formData.program === "WA Apple Health") && (
 <Field label="Service Request Number (SRN)">
 <input type="text" inputMode="numeric" pattern="\d*" className={inputClass} value={formData.odhhSrn} onChange={(e) => handleChange("odhhSrn", e.target.value.replace(/\D/g, ''))} />
 </Field>
 )}
 </div>
 {formData.program === "WA ODHH" && (
 <div className="mt-6">
 <Field 
 label="ODHH access code"
 subtext="Staff only — never shown to interpreters or included in notifications. Pilot: enter fictional values only; this app is not approved for real Medicaid or patient data."
 >
 <input type="text" className={inputClass} value={formData.odhhAccessCode} onChange={(e) => handleChange("odhhAccessCode", e.target.value)} />
 </Field>
 </div>
 )}

 </div>

 <OnsiteSignatureCard
 program={formData.program}
 checked={formData.onsiteSignatureRequired}
 locked={hasSubmittedHours(existingRequest?.data)}
 onChange={(next) => handleChange("onsiteSignatureRequired", next)}
 />

 <PatientInfoCard
 values={extras}
 showOther={showOtherPatientInfo}
 onChange={(field, value) => changeExtras(field, value)}
 />

 {/* Notes Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Notes</h2>
 <Field 
 label="Preparation and logistics notes for interpreters"
 subtext="Visible to interpreters who are offered or assigned this job."
 >
 <LimitedTextarea className="min-h-[100px]" maxLength={1000} value={formData.prepNotes} onChange={(val) => handleChange("prepNotes", val)} />
 </Field>
 <div className="mt-6">
 <Field 
 label="Agency-private notes"
 subtext="Visible to your agency staff only. Never shared with interpreters. File attachments are not available yet and are not part of this workflow."
 >
 <LimitedTextarea className="min-h-[160px]" maxLength={3000} value={formData.privateNotes} onChange={(val) => handleChange("privateNotes", val)} />
 </Field>
 </div>
 </div>

 {/* Required interpreter positions Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Required interpreter positions</h2>
  <Field
 label="Interpreters needed"
 subtext="How many interpreter positions this job has (1 to 10)."
 >
 <PositionCountField
   value={countFromLabel(formData.positions) ?? 1}
   onChange={(n) => handleChange("positions", positionsLabel(n))}
   disabled={isBookedRequest}
   disabledReason="An interpreter is booked on this job. Add or remove positions in Staffing on the request page, where bookings and offers are checked."
 />
 </Field>
 </div>

 {/* Message to the booked interpreter */}
 {isScheduleLocked && (
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Message to interpreter</h2>
 <Field
 label="Message to interpreter (Optional)"
 subtext="Added to the “Job details updated” email the booked interpreter receives when you save, and kept on their job page. Use it to answer their question. It is sent by email, so don't include client names or health information."
 >
 <textarea
 className={`${textareaClass} min-h-[100px]`}
 maxLength={1000}
 value={messageToInterpreter}
 onChange={(e) => setMessageToInterpreter(e.target.value)}
 />
 </Field>
 <p className="text-right text-xs text-gray-400">{messageToInterpreter.length}/1000</p>
 {messageToInterpreter.trim() && (
 <MessageRecipientSelect id="edit-message-recipient" recipients={messageRecipients} value={messageRecipient} onChange={setMessageRecipient} />
 )}
 </div>
 )}

 {/* Bottom Actions */}
 {isTimeInvalid && (
   <div className="text-red-600 text-sm font-medium mb-2">
     The end time must be after the start time.
   </div>
 )}
 {isEditLocked && (
   <div className="text-amber-700 text-sm font-medium mb-2 flex items-center gap-1.5">
     <Lock className="w-4 h-4 flex-shrink-0" />
     <span>{editLockMessage}</span>
   </div>
 )}
 {saveError && (
   <p role="alert" className="mb-2 text-sm font-medium text-red-700">{saveError}</p>
 )}
 <div className="flex items-center gap-4 pt-4">
 <button
   onClick={handleSave}
   disabled={isSaving || isTimeInvalid || isEditLocked || isDuplicateUnconfirmed || isAnyEmailInvalid || needsRecipient}
   className="bg-[var(--forest)] text-[var(--canvas)] px-6 py-2.5 rounded-full font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
 >
   {isSaving ? "Saving..." : "Save changes"}
 </button>
 <button onClick={() => router.push(`/requests/${requestId}`)} className="text-gray-600 px-4 py-2.5 font-medium transition-colors hover:bg-gray-100 rounded-full">
 Cancel
 </button>
 </div>
 </div>
 );
}
