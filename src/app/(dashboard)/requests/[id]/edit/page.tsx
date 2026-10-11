"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRequests } from "@/context/RequestsContext";
import { useRouter, useParams } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import { fetchLiveRequestById } from "@/app/actions/getRequests";

function CustomSelect({ options, value, onChange }: { options: string[], value?: string, onChange?: (val: string) => void }) {
 const [isOpen, setIsOpen] = useState(false);
 const [selected, setSelected] = useState(value || options[0]);
 const dropdownRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
 if (value !== undefined) setSelected(value);
 }, [value]);

 useEffect(() => {
 const handleClickOutside = (event: MouseEvent) => {
 if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
 setIsOpen(false);
 }
 };
 document.addEventListener("mousedown", handleClickOutside);
 return () => document.removeEventListener("mousedown", handleClickOutside);
 }, []);

 return (
 <div className="relative w-full" ref={dropdownRef}>
 <button
 type="button"
 onClick={() => setIsOpen(!isOpen)}
 className={`w-full bg-[#F4F3EF] rounded-full px-4 py-2.5 text-sm text-left text-gray-800 relative outline-none transition-shadow ${
 isOpen ? "ring-1 ring-[#0B3B32] border-[#0B3B32]" : ""
 }`}
 >
 <span className="block truncate pr-6">{selected}</span>
 <span className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
 <svg className="h-4 w-4 text-[var(--sage)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
 </svg>
 </span>
 </button>
 {isOpen && (
 <div className="absolute z-50 w-full mt-1 bg-[#F4F3EF] border border-gray-300 max-h-60 overflow-y-auto rounded-2xl border border-gray-200 py-1">
 {options.map((opt) => (
 <div
 key={opt}
 className="px-4 py-2 text-sm text-gray-800 cursor-pointer hover:bg-blue-600 hover:text-white"
 onClick={() => {
 setSelected(opt);
 if (onChange) onChange(opt);
 setIsOpen(false);
 }}
 >
 {opt}
 </div>
 ))}
 </div>
 )}
 </div>
 );
}

function LimitedTextarea({ className = "", maxLength = 1000, value, onChange }: { className?: string, maxLength?: number, value?: string, onChange?: (val: string) => void }) {
 const [internalValue, setInternalValue] = useState(value || "");
 const remaining = maxLength - internalValue.length;

 useEffect(() => {
 if (value !== undefined) setInternalValue(value);
 }, [value]);

 return (
 <div className="flex flex-col w-full">
 <textarea
 className={`w-full bg-[#F4F3EF] border-none rounded-2xl p-4 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] resize-none outline-none transition-shadow ${className}`}
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
         console.error(err);
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

 const [formData, setFormData] = useState({
 client: "New or one-time requester — no saved client",
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
 providerOneNumber: ""
 });

 useEffect(() => {
   if (existingRequest) {
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
       privateNotes: existingRequest?.privateNotes || "",
       positions: (existingRequest?.requiredPositions === 2 || existingRequest?.positions === "Team — two independent positions") ? "Team — two independent positions" : (existingRequest?.positions || "One interpreter"),
       program: existingRequest?.data?.intake?.program || "General",
       odhhSrn: existingRequest?.data?.intake?.odhhSrn || "",
       odhhAccessCode: existingRequest?.data?.intake?.odhhAccessCode || "",
       providerOneNumber: existingRequest?.data?.intake?.providerOneNumber || ""
     }));
   }
 }, [existingRequest]);

 useEffect(() => {
 if (existingRequest?.startsAt && existingRequest?.endsAt) {
 try {
 const ianaTz = TIMEZONE_MAP[existingRequest?.details?.timeZone || "Pacific Time — Seattle, Los Angeles"] || "America/Los_Angeles";
 const startUTC = new Date(existingRequest.startsAt);
 const endUTC = new Date(existingRequest.endsAt);
 
 const formatLocal = (d: Date, tz: string) => {
 const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
 const parts = f.formatToParts(d);
 const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
 return {
 date: `${p.year}-${p.month}-${p.day}`,
 time: `${p.hour}:${p.minute}`
 };
 };
 
 const startLocal = formatLocal(startUTC, ianaTz);
 const endLocal = formatLocal(endUTC, ianaTz);

 setFormData(prev => ({
 ...prev,
 startDate: startLocal.date,
 startTime: startLocal.time,
 endDate: endLocal.date,
 endTime: endLocal.time
 }));
 } catch (e) {
 console.error(e);
 }
 }
 }, [existingRequest]);

 const handleChange = (field: keyof typeof formData, value: string | boolean) => {
 if (field === "timeZone") {
 const oldTz = TIMEZONE_MAP[formData.timeZone] || "America/Los_Angeles";
 const newTz = TIMEZONE_MAP[value as string] || "America/Los_Angeles";
 
 try {
 if (formData.startDate && formData.startTime && formData.endDate && formData.endTime) {
 const startUTC = fromZonedTime(`${formData.startDate}T${formData.startTime}:00`, oldTz);
 const endUTC = fromZonedTime(`${formData.endDate}T${formData.endTime}:00`, oldTz);
 
 const formatLocal = (d: Date, tz: string) => {
 const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
 const parts = f.formatToParts(d);
 const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
 return {
 date: `${p.year}-${p.month}-${p.day}`,
 time: `${p.hour}:${p.minute}`
 };
 };
 
 const startLocal = formatLocal(startUTC, newTz);
 const endLocal = formatLocal(endUTC, newTz);
 
 setFormData(prev => ({ 
 ...prev, 
 timeZone: value as string,
 startDate: startLocal.date,
 startTime: startLocal.time,
 endDate: endLocal.date,
 endTime: endLocal.time
 }));
 return;
 }
 } catch (e) {
 console.error(e);
 }
 }
 setFormData(prev => ({ ...prev, [field]: value }));
 };

 const handleSave = () => {
 let startsAtStr = undefined;
 let endsAtStr = undefined;
 try {
 const ianaTz = TIMEZONE_MAP[formData.timeZone] || "America/Los_Angeles";
 const startUTC = fromZonedTime(`${formData.startDate}T${formData.startTime}:00`, ianaTz);
 const endUTC = fromZonedTime(`${formData.endDate}T${formData.endTime}:00`, ianaTz);
 startsAtStr = new Date(startUTC).toISOString();
 endsAtStr = new Date(endUTC).toISOString();
 } catch(e) {}
 
 const updatedRequest = {
 title: formData.appointmentTitle || "Interpreting request",
 setting: formData.setting,
 overview: { location: formData.venue || "TBD", reference: existingRequest.id, status: existingRequest.status },
 details: { setting: formData.setting, purpose: formData.purpose, format: formData.modality, timeZone: formData.timeZone, startDate: formData.startDate, startTime: formData.startTime, endDate: formData.endDate, endTime: formData.endTime, startsAt: startsAtStr, endsAt: endsAtStr, deafParticipant: formData.deafParticipant, peopleNeeding: formData.peopleNeeding, commPreferences: formData.commPreferences, qualifications: formData.qualifications },
 onsite: { venue: formData.venue, address: formData.address, building: formData.building, parking: formData.parking, entrance: formData.entrance, contact: formData.onsiteContactName, contactMethod: formData.onsiteContactPhone },
 requester: { name: formData.requesterName, org: formData.requesterOrg, email: formData.email, phone: formData.phone, prefContact: formData.prefContact, reqInterpreter: formData.prefInterpreter, teamSuggested: formData.teamSuggested, billOrg: formData.billOrg, billContact: formData.billContact, billEmail: formData.billEmail, poNumber: formData.poNumber },
 prepNotes: formData.prepNotes,
 privateNotes: formData.privateNotes,
 activity: "updated just now",
 startsAt: startsAtStr,
 endsAt: endsAtStr,
  positions: formData.positions,
  requiredPositions: formData.positions === "Team — two independent positions" ? 2 : 1,
  data: {
    startsAt: startsAtStr,
    endsAt: endsAtStr,
    brief: { hearingIdentity: "deaf" },
    intake: {
      program: formData.program,
      odhhSrn: formData.program === "WA ODHH" ? formData.odhhSrn : undefined,
      odhhAccessCode: formData.program === "WA ODHH" ? formData.odhhAccessCode : undefined,
      providerOneNumber: formData.program === "WA Apple Health" ? formData.providerOneNumber : undefined
    }
  }
 };
 
 updateRequest(requestId, updatedRequest);
 router.push(`/requests/${requestId}`);
 };

 const inputClass = "w-full bg-[#F4F3EF] border-none rounded-full px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow appearance-none";
 const textareaClass = "w-full bg-[#F4F3EF] border-none rounded-2xl p-4 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] resize-none outline-none transition-shadow";
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
 </div>

 {/* Client Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Client</h2>
 <Field 
 label="Requesting client on file"
 subtext="A saved client is optional. Nothing is merged automatically by name or email, and no login is created."
 >
 <CustomSelect options={["New or one-time requester — no saved client", "Fictional clinic"]} value={formData.client} onChange={(val) => handleChange("client", val)} />
 </Field>
 </div>

 {/* Requester Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Requester</h2>
 <Field 
 label="Requesting organization or contact on file"
 subtext="Choosing an existing record fills the fields below. Nothing is merged automatically and no login is created for requesters."
 >
 <CustomSelect options={["New organization or contact"]} value={formData.requesterOrgOrContact} onChange={(val) => handleChange("requesterOrgOrContact", val)} />
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
 <input type="email" className={inputClass} value={formData.email} onChange={(e) => handleChange("email", e.target.value)} />
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
 <div className="flex items-center gap-3 px-2 py-2">
 <input 
 type="checkbox" 
 className="h-5 w-5 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]" 
 checked={formData.saveOrg as boolean}
 onChange={(e) => handleChange("saveOrg", e.target.checked)}
 />
 <span className="text-[15px] text-gray-700 font-medium">
 Save this organization and contact to the agency list for future requests
 </span>
 </div>

 {/* Participants and setting Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Participants and setting</h2>
 
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
 <Field label="Deaf or hard of hearing participant">
 <input type="text" className={inputClass} value={formData.deafParticipant} onChange={(e) => handleChange("deafParticipant", e.target.value)} />
 </Field>
 <Field label="Number of participants needing interpreting">
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
 
 <Field label="Appointment time zone" subtext="Times are entered in the appointment time zone, not your computer's location.">
 <CustomSelect options={["Pacific Time — Seattle, Los Angeles", "Mountain Time — Denver", "Arizona (no daylight saving)", "Central Time — Chicago", "Eastern Time — New York", "Alaska Time", "Hawaii Time"]} value={formData.timeZone} onChange={(val) => handleChange("timeZone", val)} />
 </Field>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-6">
 <Field label="Starts" subtext="11:41 AM PDT - Pacific Time — Seattle, Los Angeles (UTC-07:00)">
 <div className="flex flex-col sm:flex-row gap-2">
 <input type="date" className={inputClass} value={formData.startDate} onChange={(e) => handleChange("startDate", e.target.value)} />
 <input type="time" className={inputClass} value={formData.startTime} onChange={(e) => handleChange("startTime", e.target.value)} />
 </div>
 </Field>
 <Field label="Ends" subtext="12:41 PM PDT - Pacific Time — Seattle, Los Angeles (UTC-07:00)">
 <div className="flex flex-col sm:flex-row gap-2">
 <input type="date" className={inputClass} value={formData.endDate} onChange={(e) => handleChange("endDate", e.target.value)} />
 <input type="time" className={inputClass} value={formData.endTime} onChange={(e) => handleChange("endTime", e.target.value)} />
 </div>
 </Field>
 </div>

 <div className="mt-6">
 <Field label="How will interpreting happen?">
 <CustomSelect options={["In person", "Virtual", "Hybrid — in person and virtual"]} value={formData.modality} onChange={(val) => handleChange("modality", val)} />
 </Field>
 </div>

 <div className="mt-6">
 <Field 
 label="Appointment title (optional)" 
 subtext="Left blank, the title becomes “Interpreting request”. Participant names are not added to titles."
 >
 <input type="text" className={inputClass} value={formData.appointmentTitle} onChange={(e) => handleChange("appointmentTitle", e.target.value)} />
 </Field>
 </div>

 <div className="flex items-center gap-3 mt-6">
 <input 
 type="checkbox" 
 className="h-5 w-5 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]" 
 checked={formData.repeats as boolean}
 onChange={(e) => handleChange("repeats", e.target.checked)}
 />
 <span className="text-[15px] text-gray-700">This repeats</span>
 </div>
 </div>

 {/* Location details Section */}
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
 <Field label="Building, floor or room">
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

 <div className="mt-6">
 <Field label="Parking">
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
 <input type="email" className={inputClass} value={formData.billEmail} onChange={(e) => handleChange("billEmail", e.target.value)} />
 </Field>
 <Field label="Purchase order or reference number (optional)">
 <input type="text" className={inputClass} value={formData.poNumber} onChange={(e) => handleChange("poNumber", e.target.value)} />
 </Field>
 </div>
 </div>

 {/* Program and state identifiers Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Program and state identifiers</h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
 <Field label="Funding program">
 <CustomSelect options={["General", "WA ODHH", "WA Apple Health"]} value={formData.program} onChange={(val) => handleChange("program", val)} />
 </Field>
 {formData.program === "WA ODHH" && (
 <Field label="Service Request Number (SRN)">
 <input type="text" inputMode="numeric" pattern="\d*" className={inputClass} value={formData.odhhSrn} onChange={(e) => handleChange("odhhSrn", e.target.value.replace(/\D/g, ''))} />
 </Field>
 )}
 {formData.program === "WA Apple Health" && (
 <Field label="ProviderOne client number">
 <input type="text" className={inputClass} value={formData.providerOneNumber} onChange={(e) => handleChange("providerOneNumber", e.target.value)} />
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

 {/* Program and state identifiers Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Program and state identifiers</h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
 <Field label="Funding program">
 <CustomSelect options={["General", "WA ODHH", "WA Apple Health"]} value={formData.program} onChange={(val) => handleChange("program", val)} />
 </Field>
 {formData.program === "WA ODHH" && (
 <Field label="Service Request Number (SRN)">
 <input type="text" inputMode="numeric" pattern="\d*" className={inputClass} value={formData.odhhSrn} onChange={(e) => handleChange("odhhSrn", e.target.value.replace(/\D/g, ''))} />
 </Field>
 )}
 {formData.program === "WA Apple Health" && (
 <Field label="ProviderOne client number">
 <input type="text" className={inputClass} value={formData.providerOneNumber} onChange={(e) => handleChange("providerOneNumber", e.target.value)} />
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
 <LimitedTextarea className="min-h-[100px]" maxLength={1000} value={formData.privateNotes} onChange={(val) => handleChange("privateNotes", val)} />
 </Field>
 </div>
 </div>

 {/* Required interpreter positions Section */}
 <div className={cardClass}>
 <h2 className={sectionTitleClass}>Required interpreter positions</h2>
 <Field 
 label="Positions staff will fill"
 subtext="Save the request, then choose a recipient for each position. No interpreter is booked yet."
 >
 <CustomSelect options={["One interpreter", "Team — two independent positions"]} value={formData.positions} onChange={(val) => handleChange("positions", val)} />
 </Field>
 </div>

 {/* Bottom Actions */}
 <div className="flex items-center gap-4 pt-4">
 <button onClick={handleSave} className="bg-[var(--forest)] text-[var(--canvas)] px-6 py-2.5 rounded-full font-medium transition-opacity hover:opacity-90">
 Save changes
 </button>
 <button onClick={() => router.push(`/requests/${requestId}`)} className="text-gray-600 px-4 py-2.5 font-medium transition-colors hover:bg-gray-100 rounded-full">
 Cancel
 </button>
 </div>
 </div>
 );
}
