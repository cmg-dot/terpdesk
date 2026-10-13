"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useClients } from "@/context/ClientsContext";
import { getClientByIdAction } from "@/app/actions/clients";
import { isInvalidEmail } from "@/utils/validation";

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
 className={`w-full bg-[#F4F3EF] rounded-full px-5 py-3 text-sm text-left text-gray-800 relative outline-none transition-shadow ${
 isOpen ? "ring-2 ring-[#0B3B32]" : ""
 }`}
 >
 <span className="block truncate pr-6">{selected}</span>
 <span className="absolute inset-y-0 right-0 flex items-center pr-5 pointer-events-none">
 <svg className="h-4 w-4 text-[var(--sage)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
 </svg>
 </span>
 </button>
 {isOpen && (
 <div className="absolute z-50 w-full mt-1 bg-[#F4F3EF] border border-[#0B3B32] max-h-60 overflow-y-auto rounded-2xl border border-gray-200 py-1">
 {options.map((opt) => (
 <div
 key={opt}
 className="px-5 py-2.5 text-sm text-gray-800 cursor-pointer hover:bg-blue-600 hover:text-white"
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

function Field({ label, children, fullWidth = false }: { label: string, children: React.ReactNode, fullWidth?: boolean }) {
 return (
 <div className={`flex flex-col ${fullWidth ? 'col-span-1 md:col-span-2' : ''}`}>
 <label className="text-[12px] font-medium text-[var(--sage)] mb-2 ml-2">{label}</label>
 {children}
 </div>
 );
}

export default function ClientDetailsPage() {
 const params = useParams();
 const id = params?.id as string;
 const router = useRouter();
 const { 
 clients, 
 isLoading,
 addClient,
 updateClient,
 archiveClient,
 restoreClient,
 deleteClient,
 addContact, 
 archiveContact, 
 restoreContact,
 deleteContact,
 makeContactDefault, 
 addLocation, 
 archiveLocation, 
 restoreLocation,
 deleteLocation,
 makeLocationDefault 
 } = useClients();

 const client = clients.find((c) => String(c.id) === String(id));

 const [formData, setFormData] = useState({
 name: client?.name || "",
 type: client?.type || "Organization",
 generalEmail: client?.generalEmail || "",
 generalPhone: client?.generalPhone || "",
 billingOrg: client?.billingOrg || "",
 billingAddress: client?.billingAddress || "",
 privateNotes: client?.privateNotes || "",
 });

 const [linkedJobs, setLinkedJobs] = useState<any[]>([]);

 useEffect(() => {
 if (client) {
 setFormData({
 name: client.name || "",
 type: client.type || "Organization",
 generalEmail: client.generalEmail || "",
 generalPhone: client.generalPhone || "",
 billingOrg: client.billingOrg || "",
 billingAddress: client.billingAddress || "",
 privateNotes: client.privateNotes || "",
 });
 }
 }, [client]);

 useEffect(() => {
 if (id) {
 getClientByIdAction(id).then(data => {
 if (data?.linkedJobs) {
 setLinkedJobs(data.linkedJobs);
 }
 }).catch(console.error);
 }
 }, [id]);

 const [isSaving, setIsSaving] = useState(false);

 const [newContactForm, setNewContactForm] = useState({
 type: "Requester contact",
 name: "",
 role: "",
 email: "",
 phone: "",
 isDefault: false
 });

 const isGeneralEmailInvalid = isInvalidEmail(formData.generalEmail);
 const isContactEmailInvalid = isInvalidEmail(newContactForm.email);

 const [newLocationForm, setNewLocationForm] = useState({
 name: "",
 address: "",
 room: "",
 parking: "",
 entrance: "",
 instructions: "",
 isDefault: false
 });

 const [contactToDelete, setContactToDelete] = useState<string | null>(null);
 const [locationToDelete, setLocationToDelete] = useState<string | null>(null);
 const [clientToDelete, setClientToDelete] = useState(false);

 if (isLoading) {
 return (
 <div className="max-w-[1200px] mx-auto p-6 flex flex-col items-center justify-center h-[50vh]">
 <h1 className="text-2xl font-bold text-gray-800 mb-4">Loading client details...</h1>
 </div>
 );
 }

 if (!client) {
 return (
 <div className="max-w-[1200px] mx-auto p-6 flex flex-col items-center justify-center h-[50vh]">
 <h1 className="text-2xl font-bold text-gray-800 mb-4">Client not found</h1>
 <Link href="/clients" className="bg-[var(--forest)] text-[var(--canvas)] px-6 py-2.5 rounded-full font-medium transition-opacity hover:opacity-90">
 ← Return to all clients
 </Link>
 </div>
 );
 }

 const inputClass = "w-full bg-[#F4F3EF] border-none rounded-full px-5 py-3 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow";
 const textareaClass = "w-full bg-[#F4F3EF] border-none rounded-2xl p-4 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow resize-none";

 return (
 <div className="max-w-[1200px] mx-auto p-6 space-y-6 pb-24 antialiased">
 {/* Breadcrumb */}
 <Link href="/clients" className="text-[13px] text-[var(--sage)] hover:text-[var(--ink)] transition-colors inline-block mb-1">
 ← All clients
 </Link>

 {/* Header & Subtitle */}
 <div className="space-y-2 mb-6">
 <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">{client.name}</h1>
 {client.isArchived ? (
 <p className="text-[15px] text-[var(--sage)]">Archived. Existing jobs keep their details; restore the client to use it on new requests.</p>
 ) : (
 <p className="text-[15px] text-[var(--sage)]">Saved details are only a starting point. Each job keeps the details confirmed for that job.</p>
 )}
 </div>

 {/* Action Buttons */}
 <div className="flex flex-wrap items-center gap-3 mb-8">
 {client.isArchived ? (
 <>
 <button className="bg-[#8BA49E] text-white/80 px-6 py-2.5 rounded-full text-sm font-medium cursor-not-allowed">
 New request for this client
 </button>
 <button onClick={() => restoreClient(client.id)} className="bg-white text-gray-700 border border-gray-200 px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors">
 Restore client
 </button>
 <button onClick={() => setClientToDelete(true)} className="bg-white text-[#9B1C1C] border border-[#9B1C1C] px-6 py-2.5 rounded-full text-sm font-medium hover:bg-red-50 transition-colors">
 Delete client
 </button>
 </>
 ) : (
 <>
 <Link href={`/requests/new?clientId=${client.id}`} className="bg-[var(--forest)] text-[var(--canvas)] px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
 New request for this client
 </Link>
 <button onClick={() => archiveClient(client.id)} className="bg-white text-gray-700 border border-gray-200 px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors">
 Archive client
 </button>
 </>
 )}
 </div>

 {/* Card 1: Client Details */}
 <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 ">
 <h2 className="text-lg font-medium text-[var(--ink)] mb-6">Client details</h2>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
 <Field label="Client name">
 <input type="text" className={inputClass} value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
 </Field>
 <Field label="Client type">
 <CustomSelect 
 options={["Organization", "Individual requesting service"]} 
 value={formData.type} 
 onChange={(val) => setFormData({...formData, type: val})} 
 />
 </Field>
 
 <Field label="General email">
 <input 
   type="email" 
   className={`${inputClass} ${isGeneralEmailInvalid ? "ring-2 ring-red-500 border-red-500" : ""}`} 
   value={formData.generalEmail} 
   onChange={(e) => setFormData({...formData, generalEmail: e.target.value})} 
 />
 {isGeneralEmailInvalid && (
   <p className="text-xs text-red-600 mt-1 font-medium">
     Please enter a valid email address (e.g., name@organization.org).
   </p>
 )}
 </Field>
 <Field label="General phone">
 <input type="tel" className={inputClass} value={formData.generalPhone} onChange={(e) => setFormData({...formData, generalPhone: e.target.value})} />
 </Field>

 <Field label="Billing organization">
 <input type="text" className={inputClass} value={formData.billingOrg} onChange={(e) => setFormData({...formData, billingOrg: e.target.value})} />
 </Field>
 <Field label="Billing address">
 <textarea className={`${textareaClass} min-h-[50px]`} value={formData.billingAddress} onChange={(e) => setFormData({...formData, billingAddress: e.target.value})} />
 </Field>

 <Field label="Agency-private notes" fullWidth>
 <textarea className={`${textareaClass} min-h-[100px]`} value={formData.privateNotes} onChange={(e) => setFormData({...formData, privateNotes: e.target.value})} />
 </Field>
 </div>

 <div className="mt-4">
 <p className="text-[12px] text-[var(--sage)] mb-4 ml-2">
 Only agency staff can read these notes. Interpreters never see the client directory, billing contacts or these notes.
 </p>
 <button 
 disabled={isGeneralEmailInvalid}
 onClick={() => {
 if (isGeneralEmailInvalid) return;
 updateClient(client.id, formData);
 setIsSaving(true);
 setTimeout(() => setIsSaving(false), 2000);
 }}
 className={`w-full md:w-auto px-6 py-2.5 rounded-full text-sm font-medium transition-opacity flex items-center justify-center sm:justify-start gap-2 ${
   isGeneralEmailInvalid ? "bg-[#8BA49E] text-white/70 opacity-60 cursor-not-allowed" : "bg-[var(--forest)] text-[var(--canvas)] hover:opacity-90"
 }`}
 >
 {isSaving ? "Saved!" : "Save client details"}
 </button>
 </div>
 </div>

 {/* Card 2: Contacts */}
 <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 space-y-8">
 <h2 className="text-lg font-medium text-[var(--ink)]">Contacts</h2>
 
 <div>
 <h3 className="text-[11px] font-semibold text-[var(--sage)] uppercase tracking-wider mb-2">Requester Contacts</h3>
 {client.contacts && client.contacts.filter(c => c.type === 'Requester contact').length > 0 ? (
 client.contacts.filter(c => c.type === 'Requester contact').map(c => (
 <div key={c.id} className="bg-[#F4F3EF] rounded-md p-3 mb-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
 <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 items-start">
 <span className="text-[var(--ink)] font-medium text-sm">{c.name}</span>
 <span className="text-[var(--sage)] text-sm">{c.role} · {c.email} · {c.phone}</span>
 {c.isArchived ? (
 <span className="text-xs border border-gray-200 bg-white rounded-full px-2 py-0.5 text-[var(--sage)]">Archived</span>
 ) : c.isDefault ? (
 <span className="text-xs border border-gray-200 bg-white rounded-full px-2 py-0.5 text-gray-600">Default</span>
 ) : null}
 </div>
 <div className="flex items-center gap-4">
 {c.isArchived ? (
 <>
 <button onClick={() => restoreContact(client.id, c.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[var(--ink)]">Restore</button>
 <button onClick={() => setContactToDelete(c.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[#9B1C1C]">Delete</button>
 </>
 ) : (
 <>
 {!c.isDefault && (
 <button onClick={() => makeContactDefault(client.id, c.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[var(--ink)]">Make default</button>
 )}
 <button onClick={() => archiveContact(client.id, c.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[var(--ink)]">Archive</button>
 </>
 )}
 </div>
 </div>
 ))
 ) : (
 <p className="text-sm text-[var(--ink)]">None saved yet.</p>
 )}
 </div>

 <div>
 <h3 className="text-[11px] font-semibold text-[var(--sage)] uppercase tracking-wider mb-2">Billing Contact</h3>
 {client.contacts && client.contacts.filter(c => c.type === 'Billing contact').length > 0 ? (
 client.contacts.filter(c => c.type === 'Billing contact').map(c => (
 <div key={c.id} className="bg-[#F4F3EF] rounded-md p-3 mb-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
 <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 items-start">
 <span className="text-[var(--ink)] font-medium text-sm">{c.name}</span>
 <span className="text-[var(--sage)] text-sm">{c.role} · {c.email} · {c.phone}</span>
 {c.isArchived ? (
 <span className="text-xs border border-gray-200 bg-white rounded-full px-2 py-0.5 text-[var(--sage)]">Archived</span>
 ) : c.isDefault ? (
 <span className="text-xs border border-gray-200 bg-white rounded-full px-2 py-0.5 text-gray-600">Default</span>
 ) : null}
 </div>
 <div className="flex items-center gap-4">
 {c.isArchived ? (
 <>
 <button onClick={() => restoreContact(client.id, c.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[var(--ink)]">Restore</button>
 <button onClick={() => setContactToDelete(c.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[#9B1C1C]">Delete</button>
 </>
 ) : (
 <>
 {!c.isDefault && (
 <button onClick={() => makeContactDefault(client.id, c.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[var(--ink)]">Make default</button>
 )}
 <button onClick={() => archiveContact(client.id, c.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[var(--ink)]">Archive</button>
 </>
 )}
 </div>
 </div>
 ))
 ) : (
 <p className="text-sm text-[var(--ink)]">None saved yet.</p>
 )}
 </div>

 <div className="border-t border-gray-200 pt-6">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
 <Field label="Contact type">
 <CustomSelect 
 options={["Requester contact", "Billing contact"]} 
 value={newContactForm.type}
 onChange={(val) => setNewContactForm({ ...newContactForm, type: val })}
 />
 </Field>
 <Field label="Name">
 <input type="text" className={inputClass} value={newContactForm.name} onChange={e => setNewContactForm({ ...newContactForm, name: e.target.value })} />
 </Field>
 <Field label="Role">
 <input type="text" className={inputClass} value={newContactForm.role} onChange={e => setNewContactForm({ ...newContactForm, role: e.target.value })} />
 </Field>
 <Field label="Email">
 <input 
   type="email" 
   className={`${inputClass} ${isContactEmailInvalid ? "ring-2 ring-red-500 border-red-500" : ""}`} 
   value={newContactForm.email} 
   onChange={e => setNewContactForm({ ...newContactForm, email: e.target.value })} 
 />
 {isContactEmailInvalid && (
   <p className="text-xs text-red-600 mt-1 font-medium">
     Please enter a valid email address (e.g., name@organization.org).
   </p>
 )}
 </Field>
 <Field label="Phone">
 <input type="tel" className={inputClass} value={newContactForm.phone} onChange={e => setNewContactForm({ ...newContactForm, phone: e.target.value })} />
 </Field>
 </div>
 <div className="flex items-center gap-3 mt-6 ml-2">
 <input 
 type="checkbox" 
 checked={newContactForm.isDefault}
 onChange={e => setNewContactForm({ ...newContactForm, isDefault: e.target.checked })}
 className="h-4 w-4 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]" 
 />
 <span className="text-[14px] text-gray-600">Use as the default for this client</span>
 </div>
 <div className="mt-4">
 <button 
 disabled={!newContactForm.name.trim() || isContactEmailInvalid}
 onClick={() => {
 if (!newContactForm.name.trim() || isContactEmailInvalid) return;
 addContact(client.id, {
 id: Date.now().toString(),
 type: newContactForm.type as 'Requester contact' | 'Billing contact',
 name: newContactForm.name,
 role: newContactForm.role,
 email: newContactForm.email,
 phone: newContactForm.phone,
 isDefault: newContactForm.isDefault
 });
 setNewContactForm({ type: "Requester contact", name: "", role: "", email: "", phone: "", isDefault: false });
 }}
 className={`w-full md:w-auto px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
 newContactForm.name.trim() && !isContactEmailInvalid
 ? 'bg-[var(--forest)] text-[var(--canvas)] hover:opacity-90' 
 : 'bg-[#8BA49E] text-white/70 opacity-60 cursor-not-allowed'
 }`}
 >
 Add contact
 </button>
 </div>
 </div>
 </div>

 {/* Card 3: Locations */}
 <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 space-y-6">
 <h2 className="text-lg font-medium text-[var(--ink)]">Locations</h2>
 
 <div>
 {client.locations && client.locations.length > 0 ? (
 client.locations.map(l => (
 <div key={l.id} className="bg-[#F4F3EF] rounded-md p-3 mb-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
 <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 items-start">
 <span className="text-[var(--ink)] font-medium text-sm">{l.name}</span>
 <span className="text-[var(--sage)] text-sm">
 {[l.address, l.room].filter(Boolean).join(" · ")}
 </span>
 {l.isArchived ? (
 <span className="text-xs border border-gray-200 bg-white rounded-full px-2 py-0.5 text-[var(--sage)]">Archived</span>
 ) : l.isDefault ? (
 <span className="text-xs border border-gray-200 bg-white rounded-full px-2 py-0.5 text-gray-600">Default</span>
 ) : null}
 </div>
 <div className="flex items-center gap-4">
 {l.isArchived ? (
 <>
 <button onClick={() => restoreLocation(client.id, l.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[var(--ink)]">Restore</button>
 <button onClick={() => setLocationToDelete(l.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[#9B1C1C]">Delete</button>
 </>
 ) : (
 <>
 {!l.isDefault && (
 <button onClick={() => makeLocationDefault(client.id, l.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[var(--ink)]">Make default</button>
 )}
 <button onClick={() => archiveLocation(client.id, l.id)} className="underline text-[13px] text-[var(--sage)] hover:text-[var(--ink)]">Archive</button>
 </>
 )}
 </div>
 </div>
 ))
 ) : (
 <p className="text-sm text-[var(--ink)] mb-2">No saved locations yet.</p>
 )}
 </div>

 <div className="border-t border-gray-200 pt-6">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
 <Field label="Location name">
 <input type="text" className={inputClass} value={newLocationForm.name} onChange={e => setNewLocationForm({...newLocationForm, name: e.target.value})} />
 </Field>
 <Field label="Street address">
 <input type="text" className={inputClass} value={newLocationForm.address} onChange={e => setNewLocationForm({...newLocationForm, address: e.target.value})} />
 </Field>
 <Field label="Room or suite">
 <input type="text" className={inputClass} value={newLocationForm.room} onChange={e => setNewLocationForm({...newLocationForm, room: e.target.value})} />
 </Field>
 <Field label="Parking">
 <input type="text" className={inputClass} value={newLocationForm.parking} onChange={e => setNewLocationForm({...newLocationForm, parking: e.target.value})} />
 </Field>
 <Field label="Entrance">
 <input type="text" className={inputClass} value={newLocationForm.entrance} onChange={e => setNewLocationForm({...newLocationForm, entrance: e.target.value})} />
 </Field>
 <Field label="Check-in instructions">
 <textarea className={`${textareaClass} min-h-[100px]`} value={newLocationForm.instructions} onChange={e => setNewLocationForm({...newLocationForm, instructions: e.target.value})} />
 </Field>
 </div>
 <div className="flex items-center gap-3 mt-6 ml-2">
 <input 
 type="checkbox" 
 checked={newLocationForm.isDefault}
 onChange={e => setNewLocationForm({...newLocationForm, isDefault: e.target.checked})}
 className="h-4 w-4 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]" 
 />
 <span className="text-[14px] text-gray-600">Use as the default location for this client</span>
 </div>
 <div className="mt-4">
 <button 
 onClick={() => {
 if (!newLocationForm.name.trim()) return;
 addLocation(client.id, {
 id: Date.now().toString(),
 name: newLocationForm.name,
 address: newLocationForm.address,
 room: newLocationForm.room,
 parking: newLocationForm.parking,
 entrance: newLocationForm.entrance,
 instructions: newLocationForm.instructions,
 isDefault: newLocationForm.isDefault
 });
 setNewLocationForm({ name: "", address: "", room: "", parking: "", entrance: "", instructions: "", isDefault: false });
 }}
 className={`w-full md:w-auto px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
 newLocationForm.name.trim() 
 ? 'bg-[var(--forest)] text-[var(--canvas)] hover:opacity-90' 
 : 'bg-[#8BA49E] text-white/70 opacity-60 cursor-not-allowed'
 }`}
 >
 Add location
 </button>
 </div>
 </div>
 </div>

 {/* Card 4: Linked Jobs */}
 <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 ">
 <h2 className="text-lg font-medium text-[var(--ink)] mb-4">Linked jobs ({linkedJobs.length})</h2>
 {linkedJobs.length > 0 ? (
 <div className="space-y-3 mb-4">
 {linkedJobs.map((job) => (
 <div key={job.id} className="bg-[#F4F3EF] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <div>
 <span className="font-semibold text-sm text-[var(--ink)] block">{job.title}</span>
 <span className="text-xs text-[var(--sage)]">Status: {job.status || "draft"}</span>
 </div>
 <Link href={`/requests/${job.id}`} className="text-xs font-medium text-[var(--forest)] hover:underline inline-flex items-center gap-1">
 View request →
 </Link>
 </div>
 ))}
 </div>
 ) : (
 <p className="text-sm text-[var(--ink)] mb-2">No jobs are linked to this client yet.</p>
 )}
 <p className="text-[14px] text-[var(--sage)]">
 Changing saved client details never rewrites these jobs. Each job keeps the address, contact and instructions that were confirmed when it was booked.
 </p>
 </div>

 {/* Card 5: History */}
 <div className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 ">
 <h2 className="text-lg font-medium text-[var(--ink)] mb-6">History</h2>
 <div className="space-y-4">
 {client.auditLogs && client.auditLogs.length > 0 ? (
 client.auditLogs.map((log, index) => {
 const date = new Date(log.timestamp);
 const formattedDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
 const formattedTime = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
 
 return (
 <div key={log.id} className={`${index !== 0 ? 'border-t border-gray-200 pt-4' : ''}`}>
 <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 mb-2">
 <span className="text-[var(--ink)] font-medium text-sm w-32 shrink-0">{log.action}</span>
 <span className="text-[var(--sage)] text-[13px] sm:text-right">
 {formattedDate}, {formattedTime} · {log.user}
 </span>
 </div>
 <p className="text-[13px] text-[var(--sage)]">{log.details}</p>
 </div>
 );
 })
 ) : (
 <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
 <span className="text-[var(--ink)] font-medium text-sm">Created</span>
 <span className="text-[var(--sage)] text-[13px] sm:text-right">
 Sep 28, 2026, 9:23 PM · Avery North
 </span>
 </div>
 )}
 </div>
 </div>

 {contactToDelete && (
 <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
 <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
 <p className="text-[var(--ink)] font-medium mb-6">Are you sure you want to permanently delete this contact?</p>
 <div className="flex justify-end gap-3">
 <button onClick={() => setContactToDelete(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-full transition-colors">
 Cancel
 </button>
 <button 
 onClick={() => {
 deleteContact(client.id, contactToDelete);
 setContactToDelete(null);
 }} 
 className="px-4 py-2 text-sm font-medium bg-[#9B1C1C] text-white rounded-full hover:opacity-90 transition-opacity"
 >
 Delete
 </button>
 </div>
 </div>
 </div>
 )}

 {locationToDelete && (
 <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
 <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
 <p className="text-[var(--ink)] font-medium mb-6">Are you sure you want to permanently delete this location?</p>
 <div className="flex justify-end gap-3">
 <button onClick={() => setLocationToDelete(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-full transition-colors">
 Cancel
 </button>
 <button 
 onClick={() => {
 deleteLocation(client.id, locationToDelete);
 setLocationToDelete(null);
 }} 
 className="px-4 py-2 text-sm font-medium bg-[#9B1C1C] text-white rounded-full hover:opacity-90 transition-opacity"
 >
 Delete
 </button>
 </div>
 </div>
 </div>
 )}

 {clientToDelete && (
 <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
 <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
 <p className="text-[var(--ink)] font-medium mb-6">Are you sure you want to permanently delete this client? This cannot be undone.</p>
 <div className="flex justify-end gap-3">
 <button onClick={() => setClientToDelete(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-full transition-colors">
 Cancel
 </button>
 <button 
 onClick={() => {
 deleteClient(client.id);
 router.push('/clients');
 }} 
 className="px-4 py-2 text-sm font-medium bg-[#9B1C1C] text-white rounded-full hover:opacity-90 transition-opacity"
 >
 Delete
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
