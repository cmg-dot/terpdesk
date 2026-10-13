"use client";

import { motion } from "framer-motion";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useClients } from "@/context/ClientsContext";
import Link from "next/link";
import { useRouter } from "next/navigation";

function CustomSelect({ options, value, onChange, variant = "default" }: { options: string[], value?: string, onChange?: (val: string) => void, variant?: "default" | "outline" }) {
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

 const triggerClass = variant === "outline" 
 ? "bg-white border border-[#0B3B32]" 
 : "bg-[#F4F3EF] border-none";

 return (
 <div className="relative w-full" ref={dropdownRef}>
 <button
 type="button"
 onClick={() => setIsOpen(!isOpen)}
 className={`w-full ${triggerClass} rounded-full px-5 py-2.5 text-sm text-left text-gray-800 relative outline-none transition-shadow ${
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

export default function ClientsPage() {
 const { clients, addClient, refreshClients } = useClients();
 const router = useRouter();

 useEffect(() => {
   refreshClients();
 }, [refreshClients]);
 const [isCreating, setIsCreating] = useState(false);
 const [newName, setNewName] = useState("");
 const [newType, setNewType] = useState("Organization");
 const [filter, setFilter] = useState<'Active clients' | 'Archived clients' | 'All clients'>('Active clients');
 const [searchQuery, setSearchQuery] = useState("");

 const filteredClients = clients.filter(c => {
 // Status filter
 if (filter === 'Active clients' && c.isArchived) return false;
 if (filter === 'Archived clients' && !c.isArchived) return false;
 
 // Search filter
 if (searchQuery.trim()) {
 const query = searchQuery.toLowerCase();
 const matchName = c.name.toLowerCase().includes(query);
 const matchContacts = c.contacts?.some(contact => 
 contact.name.toLowerCase().includes(query) || 
 contact.email.toLowerCase().includes(query) || 
 contact.phone.includes(query)
 );
 const matchLocations = c.locations?.some(location => 
 location.name.toLowerCase().includes(query) || 
 location.address.toLowerCase().includes(query) || 
 location.room.toLowerCase().includes(query)
 );
 
 if (!matchName && !matchContacts && !matchLocations) {
 return false;
 }
 }

 return true;
 });

 const handleCreate = async () => {
 if (!newName.trim()) return;
 
 const createdId = await addClient({
 name: newName.trim(),
 type: newType,
 });
 
 setNewName("");
 setNewType("Organization");
 setIsCreating(false);
 
 router.push(`/clients/${createdId}`);
 };

 return (
 <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-[1200px] mx-auto p-6 space-y-6 pb-24 antialiased">
 {/* Top Banner */}
 {/* Header & Subtitle */}
 <div className="space-y-2 mb-8">
 <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">Clients</h1>
 <p className="text-[15px] text-[var(--sage)]">
 Organizations and individuals who request interpreting. The person receiving service is named on each assignment, never stored here.
 </p>
 </div>

 {/* Search & Action Card */}
 <div className={`rounded-2xl border border-gray-200 p-6 border border-gray-200 transition-colors ${isCreating ? 'bg-[#FCFCFB]' : 'bg-white'}`}>
 {/* Top Row */}
 <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
 <div className="flex-1 flex flex-col md:flex-row gap-6">
 <div className="flex-1">
 <label className="block text-[12px] font-medium text-[var(--sage)] mb-2 ml-2">Search clients, contacts and locations</label>
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Name, contact or address"
 className="w-full bg-[#F4F3EF] border-none rounded-full px-5 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
 />
 </div>
 <div className="md:w-[250px]">
 <label className="block text-[12px] font-medium text-[var(--sage)] mb-2 ml-2">Show</label>
 <CustomSelect 
 options={["Active clients", "Archived clients", "All clients"]}
 value={filter}
 onChange={(val) => setFilter(val as any)}
 variant="default"
 />
 </div>
 </div>
 <button
 onClick={() => setIsCreating(!isCreating)}
 className="w-full md:w-auto shrink-0 bg-[var(--forest)] text-[var(--canvas)] px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity h-[40px]"
 >
 {isCreating ? "Close" : "Add client"}
 </button>
 </div>

 {/* Inline Creation Form */}
 {isCreating && (
 <div className="mt-8 pt-6 border-t border-gray-200/50">
 <div className="flex flex-col md:flex-row md:items-end gap-6">
 <div className="flex-1">
 <label className="block text-[12px] font-medium text-[var(--sage)] mb-2 ml-2">Client name</label>
 <input
 type="text"
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 className="w-full bg-[#F4F3EF] border-none rounded-full px-5 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
 />
 </div>
 <div className="md:w-[250px]">
 <label className="block text-[12px] font-medium text-[var(--sage)] mb-2 ml-2">Client type</label>
 <CustomSelect 
 options={["Organization", "Individual"]}
 value={newType}
 onChange={(val) => setNewType(val)}
 variant="default"
 />
 </div>
 <button
 onClick={handleCreate}
 className={`w-full md:w-auto shrink-0 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-colors h-[40px] ${
 newName.trim() ? "bg-[var(--forest)]" : "bg-[#7B958F]"
 }`}
 >
 Create client
 </button>
 </div>
 <p className="text-[12px] text-gray-400 mt-4 ml-2">
 Creating a client never creates a login, sends an invitation or sends email.
 </p>
 </div>
 )}
 </div>

 {/* Client Grid */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
 {filteredClients.map((client) => (
 <div key={client.id} className="bg-white rounded-2xl border border-gray-200 border border-gray-200 p-6 hover: transition-shadow">
 <div className="flex items-center justify-between mb-6">
 <div className="flex items-center gap-3">
 <h3 className="text-base font-semibold text-[var(--ink)]">{client.name}</h3>
 {client.isArchived && <span className="text-xs border border-gray-200 bg-[#F4F3EF] rounded-full px-2 py-0.5 text-[var(--sage)]">Archived</span>}
 </div>
 <Link href={`/clients/${client.id}`} className="text-[13px] text-[var(--sage)] underline underline-offset-4 hover:text-[var(--ink)] transition-colors">Open</Link>
 </div>
 
 <div className="space-y-4 text-[13px]">
 <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
 <span className="text-[var(--sage)] shrink-0">Type</span>
 <span className="text-[var(--ink)] font-medium sm:text-right">{client.type}</span>
 </div>
 <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
 <span className="text-[var(--sage)] shrink-0">General contact</span>
 <span className="text-[var(--ink)] font-medium sm:text-right break-words sm:break-normal">
 {[client.generalEmail, client.generalPhone].filter(Boolean).join(" · ") || "No contact info"}
 </span>
 </div>
 <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
 <span className="text-[var(--sage)] shrink-0">On file</span>
 <span className="text-[var(--ink)] font-medium sm:text-right">
 {client.stats || `${client.contacts?.length || 0} contacts · ${client.locations?.length || 0} locations · ${client.linkedJobsCount ?? 0} linked jobs`}
 </span>
 </div>
 </div>
 </div>
 ))}
 {filteredClients.length === 0 && (
 <div className="col-span-full bg-white rounded-2xl border border-gray-200 p-12 text-center">
 <p className="text-[15px] font-medium text-[var(--ink)] mb-1">No clients found</p>
 <p className="text-sm text-[var(--sage)]">
 {searchQuery ? "Try adjusting your search terms." : "Add your first client to start organizing contacts and locations."}
 </p>
 </div>
 )}
 </div>
 </motion.div>
 );
}
