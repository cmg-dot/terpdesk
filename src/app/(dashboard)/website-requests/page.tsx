"use client";

import { motion } from "framer-motion";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";

export default function WebsiteRequestsPage() {
 return (
 <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-[1200px] mx-auto p-6 space-y-6 pb-24 antialiased">
 {/* Top Banner */}
 {/* Header Section */}
 <div className="space-y-2 mb-8">
 <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Website requests</h1>
 <p className="text-[15px] text-[var(--sage)] max-w-2xl mt-2 mb-8">
 Guest requests awaiting agency review. No interpreter is confirmed until staff create and staff the appointment.
 </p>
 </div>

 {/* Empty State Card */}
 <div className="bg-white rounded-2xl border border-gray-200 p-8 border border-gray-200 ">
 <svg className="w-8 h-8 text-indigo-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
 </svg>
 <h3 className="font-medium text-[var(--ink)] mt-4 text-base">No website requests yet</h3>
 <p className="text-[var(--sage)] text-sm mt-1">
 New requests from the gated {DEFAULT_AGENCY_NAME} site will appear here.
 </p>
 </div>
 </motion.div>
 );
}
