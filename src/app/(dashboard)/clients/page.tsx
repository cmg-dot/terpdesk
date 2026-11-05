"use client";

import { motion } from "framer-motion";
import React, { useState, useEffect, useMemo } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useClients } from "@/context/ClientsContext";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CLIENT_TYPE_LABELS,
  CLIENT_TYPE_OPTIONS,
  CLIENT_TYPE_TONES,
  clientTypeFromLabel,
  normalizeClientType,
} from "@/lib/validation/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function ClientsPage() {
 const { clients, addClient, refreshClients } = useClients();
 const router = useRouter();

 useEffect(() => {
   refreshClients();
 }, [refreshClients]);
 const [isCreating, setIsCreating] = useState(false);
 const [newName, setNewName] = useState("");
 const [newType, setNewType] = useState<string>("organization");
 const [filter, setFilter] = useState<'Active organizations' | 'Archived organizations' | 'All organizations'>('Active organizations');
 const [searchQuery, setSearchQuery] = useState("");

 const filteredClients = clients.filter(c => {
 // Status filter
 if (filter === 'Active organizations' && c.isArchived) return false;
 if (filter === 'Archived organizations' && !c.isArchived) return false;
 
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
 location.name?.toLowerCase().includes(query) ||
 location.address?.toLowerCase().includes(query) ||
 location.room?.toLowerCase().includes(query)
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
 setNewType("organization");
 setIsCreating(false);
 
 router.push(`/clients/${createdId}`);
 };

 return (
 <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-[1200px] mx-auto p-6 space-y-6 pb-24 antialiased">
 {/* Top Banner */}
 {/* Header & Subtitle */}
 <div className="space-y-2 mb-8">
 <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">Organizations</h1>
 <p className="text-[15px] text-[var(--sage)]">
 Organizations and individuals who request interpreting. The person receiving service is named on each assignment, never stored here.
 </p>
 </div>

 {/* Search & Action Card */}
 <div className="rounded-2xl border border-gray-200 bg-white p-6">
 {/* Top Row */}
 <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
 <div className="flex-1 flex flex-col md:flex-row gap-6">
 <div className="flex-1">
 <label className="block text-[12px] font-medium text-[var(--sage)] mb-2 ml-2">Search organizations, contacts and locations</label>
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
 options={["Active organizations", "Archived organizations", "All organizations"]}
 value={filter}
 onChange={(val) => setFilter(val as any)}
 />
 </div>
 </div>
 <Dialog open={isCreating} onOpenChange={setIsCreating}>
 <DialogTrigger className="w-full md:w-auto shrink-0 bg-[var(--forest)] text-[var(--canvas)] px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity h-[40px]">
 Add organization
 </DialogTrigger>
 <DialogContent className="overflow-visible">
 <DialogHeader>
 <DialogTitle>Add organization</DialogTitle>
 <DialogDescription>Creating an organization never creates a login, sends an invitation or sends email.</DialogDescription>
 </DialogHeader>
 <div className="space-y-5">
 <div>
 <label className="block text-[12px] font-medium text-[var(--sage)] mb-2 ml-2">Organization name</label>
 <input
 type="text"
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === "Enter") handleCreate();
 }}
 className="w-full bg-[#F4F3EF] border-none rounded-full px-5 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none"
 />
 </div>
 <div>
 <label className="block text-[12px] font-medium text-[var(--sage)] mb-2 ml-2">Organization type</label>
 <CustomSelect
 options={CLIENT_TYPE_OPTIONS.map((o) => o.label)}
 value={CLIENT_TYPE_LABELS[normalizeClientType(newType)]}
 onChange={(val) => setNewType(clientTypeFromLabel(val))}
 />
 </div>
 </div>
 <DialogFooter>
 <button
 type="button"
 onClick={() => setIsCreating(false)}
 className="w-full sm:w-auto px-6 py-2.5 rounded-full text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors h-[40px]"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={handleCreate}
 className={`w-full sm:w-auto shrink-0 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-colors h-[40px] ${
 newName.trim() ? "bg-[var(--forest)]" : "bg-[#7B958F]"
 }`}
 >
 Create organization
 </button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 </div>

 {/* Organization grid */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
 {filteredClients.map((client) => (
 <div
 key={client.id}
 className="flex h-full flex-col justify-between bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-all duration-200 cursor-default"
 >
 <div>
 <div className="flex items-start justify-between gap-3 mb-5">
 <div className="min-w-0 space-y-2">
 <h3 className="text-base font-semibold text-[var(--ink)] break-words">{client.name}</h3>
 <div className="flex flex-wrap items-center gap-2">
 <Badge variant={CLIENT_TYPE_TONES[normalizeClientType(client.type)]}>{CLIENT_TYPE_LABELS[normalizeClientType(client.type)]}</Badge>
 {client.isArchived && <Badge variant="gray">Archived</Badge>}
 </div>
 </div>
 <Link href={`/clients/${client.id}`} className="shrink-0 text-[13px] text-[var(--sage)] underline underline-offset-4 hover:text-[var(--ink)] transition-colors">Open</Link>
 </div>

 <ul className="space-y-3 text-[13px] text-[var(--sage)]">
 <li className="flex items-center gap-2.5">
 <Mail className="w-4 h-4 shrink-0 text-gray-400" aria-hidden="true" />
 <span className="break-all">{client.generalEmail || "No email on file"}</span>
 </li>
 <li className="flex items-center gap-2.5">
 <Phone className="w-4 h-4 shrink-0 text-gray-400" aria-hidden="true" />
 <span>{client.generalPhone || "No phone on file"}</span>
 </li>
 <li className="flex items-center gap-2.5">
 <Link2 className="w-4 h-4 shrink-0 text-gray-400" aria-hidden="true" />
 <span>{client.linkedJobsCount ?? 0} linked jobs</span>
 </li>
 </ul>
 </div>

 <p className="mt-5 border-t border-gray-100 pt-4 text-[12px] text-gray-400">
 {client.stats || `${client.contacts?.length || 0} contacts · ${client.locations?.length || 0} locations`}
 </p>
 </div>
 ))}
 {filteredClients.length === 0 && (
 <div className="col-span-full bg-white rounded-2xl border border-gray-200 p-12 text-center">
 <p className="text-[15px] font-medium text-[var(--ink)] mb-1">No organizations found</p>
 <p className="text-sm text-[var(--sage)]">
 {searchQuery ? "Try adjusting your search terms." : "Add your first organization to start organizing contacts and locations."}
 </p>
 </div>
 )}
 </div>
 </motion.div>
 );
}
