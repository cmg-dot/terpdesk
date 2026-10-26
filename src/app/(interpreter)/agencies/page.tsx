"use client";

import React, { useEffect, useState } from "react";
import { useGlobalState } from "@/context/GlobalContext";
import { motion } from "framer-motion";
import { useAgencyPermissions } from "@/hooks/useAgencyPermissions";
import { getMyConnections } from "@/app/actions/agencyConnections";
import type { MyConnection } from "@/app/actions/agencyConnections";

export default function AgenciesPage() {
  const { currentUser, requestToJoinAgency, agencies, rosterAgencyIds } = useGlobalState();
  const { permissionFor, pendingKey, error: permError, setSharing, setAutoBook } = useAgencyPermissions(
    currentUser.role === 'interpreter' && Boolean(currentUser.id),
  );
  const [inputCode, setInputCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [connections, setConnections] = useState<MyConnection[]>([]);
  const loadConnections = () => {
    if (currentUser.role !== 'interpreter' || !currentUser.id) return;
    getMyConnections().then(setConnections).catch(() => setConnections([]));
  };
  useEffect(loadConnections, [currentUser.role, currentUser.id]);

  const handleSendRequest = async () => {
    if (inputCode.trim()) {
      const result = await requestToJoinAgency(inputCode);
      if (result && result.error) {
        setErrorMsg(result.error);
        setSuccessMsg("");
      } else {
        setInputCode("");
        setErrorMsg("");
        setSuccessMsg("Request sent. The agency will review it.");
        loadConnections();
      }
    }
  };

  // Connected = approved connections from the database. Pending and declined ones are listed as requests.
  const connectedAgencies = rosterAgencyIds.map(id => ({ key: id, agencyId: id }));
  const myRequests = connections
    .filter(c => c.status !== 'approved')
    .map(c => ({ id: c.id, agency_id: c.agencyId, state: c.status === 'rejected' ? 'declined' : 'pending' }));

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto w-full max-w-[1200px] space-y-6 p-4 pb-24 sm:space-y-10 md:p-8">
      
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-[32px] font-semibold tracking-tight text-[var(--ink)]">Agencies</h1>
        <p className="text-[15px] text-[var(--sage)]">
          Connect with as many agencies as you like. Each one sees only its own work with you.
        </p>
      </div>

      <div className="space-y-6">
        
        {/* Connect with an agency */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 md:p-8">
          <h2 className="text-[19px] font-semibold text-[var(--ink)] mb-6">Connect with an agency</h2>
          
          <div className="space-y-2 mb-6">
            <label className="text-[13px] font-medium text-[var(--sage)]">Agency join code</label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <input 
                type="text" 
                value={inputCode}
                onChange={(e) => { setInputCode(e.target.value); setErrorMsg(""); setSuccessMsg(""); }}
                placeholder="For example ASLPRO-2026"
                className="w-full sm:w-[320px] rounded-full bg-[#F3F2EE] px-6 py-3.5 text-[15px] text-slate-700 placeholder:text-slate-400 border border-neutral-200/50 outline-none focus:ring-2 focus:ring-[#0B3B32]/30"
              />
              <button 
                onClick={handleSendRequest}
                disabled={!inputCode.trim()}
                className="h-[52px] rounded-full bg-[#0B3B32] px-8 text-[15px] font-medium text-white transition-colors hover:bg-[#0a2e27] disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Send request
              </button>
            </div>
            {errorMsg && (
              <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-[#C23B22]">
                {errorMsg}
              </p>
            )}
            {successMsg && <p className="text-emerald-600 text-sm mt-2">{successMsg}</p>}
          </div>
          
          <p className="text-[13px] text-[var(--sage)] max-w-3xl">
            Ask the agency for their code. Sending a request does not give you access — the agency decides. Until they approve, you cannot see their appointments, clients or roster.
          </p>
        </div>

        {/* Connected */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 md:p-8">
          <h2 className="text-[19px] font-semibold text-[var(--ink)] mb-6">Connected</h2>
          
          <div className="space-y-0">
            {connectedAgencies.length === 0 && (
              <p className="text-[15px] text-[var(--sage)]">No connected agencies.</p>
            )}
            
            {connectedAgencies.map((membership, i) => {
              const agency = agencies.find(a => a.id === membership.agencyId);
              return (
                <div key={membership.key} className={`flex flex-col sm:flex-row sm:items-center gap-4 py-4 ${i !== 0 ? 'border-t border-gray-100' : ''}`}>
                  <span className="text-[15px] font-medium text-[var(--ink)]">{agency?.name || 'Unknown Agency'}</span>
                  <span className="rounded-full bg-[#E6EFEA] px-3 py-1 text-[11px] font-semibold text-[#385B52]">Active</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Share my availability */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 md:p-8">
          <h2 className="text-[19px] font-semibold text-[var(--ink)] mb-4">Share my availability</h2>
          <p className="text-[14px] text-[var(--sage)] mb-8 max-w-4xl leading-relaxed">
            Off for every agency until you switch it on. When it is on, that agency's staff can see which hours you are open and which are taken — start and end times only. They never see your private titles, your address, or anything about another agency. Sharing does not let anyone book you or fill jobs for you; you still accept every offer yourself.
          </p>

          <div className="space-y-0">
            {connectedAgencies.length === 0 && (
              <p className="text-[15px] text-[var(--sage)]">No connected agencies to share with.</p>
            )}
            
            {connectedAgencies.map((membership, i) => {
              const agency = agencies.find(a => a.id === membership.agencyId);
              const perm = permissionFor(membership.agencyId);
              const saving = pendingKey === `share:${membership.agencyId}`;
              return (
                <div key={membership.key} className={`flex flex-col sm:flex-row sm:items-center gap-4 py-5 ${i !== 0 ? 'border-t border-gray-100' : ''}`}>
                  <span className="text-[15px] font-medium text-[var(--ink)] w-full sm:w-[280px]">{agency?.name || 'Unknown Agency'}</span>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold shrink-0 ${perm.sharesAvailability ? 'bg-[#E6EFEA] text-[#385B52]' : 'bg-[#F3F2EE] text-slate-500'}`}>
                    {perm.sharesAvailability ? 'Sharing' : 'Not sharing'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSharing(membership.agencyId, !perm.sharesAvailability)}
                    disabled={Boolean(pendingKey)}
                    className="h-9 rounded-full border border-gray-200 px-5 text-[13px] font-medium text-slate-600 hover:bg-gray-50 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving…' : perm.sharesAvailability ? 'Stop sharing' : 'Share with this agency'}
                  </button>
                </div>
              );
            })}
            {permError && <p role="alert" className="mt-4 text-[13px] font-medium text-[#C23B22]">{permError}</p>}
          </div>
        </div>

        {/* Allow an agency to auto-book */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 md:p-8">
          <h2 className="text-[19px] font-semibold text-[var(--ink)] mb-4">Allow an agency to auto-book</h2>
          
          <div className="space-y-4 mb-8">
            <p className="text-[14px] text-[var(--sage)] max-w-4xl leading-relaxed">
              Separate from sharing your availability. This one lets an agency book you into a job without waiting for you to accept it. It is off for every agency until you switch it on, and no agency can switch it on for you.
            </p>
            
            <ul className="list-disc pl-5 space-y-1.5 text-[14px] text-[var(--sage)] max-w-4xl">
              <li>Only appointments that sit entirely inside the availability you have provided, with no private busy time or accepted booking in the way — including work from other agencies.</li>
              <li>Only virtual appointments for now, because travel time is not checked yet. In-person work still comes to you as an offer you accept.</li>
              <li>Only appointments starting at least the notice period you choose from now, using the server's own clock.</li>
              <li>Turning this off, or changing the notice, applies to future bookings only. Jobs already booked stay booked.</li>
            </ul>

            <p className="text-[14px] text-[var(--sage)] max-w-4xl leading-relaxed mt-2">
              Qualifications, travel time and rates are <span className="font-semibold">not</span> checked. Bookings and other activity do create notices for you; they always appear in your notifications here. Booking emails (offers, confirmations, changes, cancellations and hours corrections) are always sent too, without location or client details.
            </p>
          </div>

          <div className="space-y-0">
            {connectedAgencies.length === 0 && (
              <p className="text-[15px] text-[var(--sage)]">No connected agencies to allow auto-booking.</p>
            )}
            
            {connectedAgencies.map((membership, i) => {
              const agency = agencies.find(a => a.id === membership.agencyId);
              const agencyName = agency?.name || 'this agency';
              const perm = permissionFor(membership.agencyId);
              const saving = pendingKey === `auto:${membership.agencyId}`;
              return (
                <div key={membership.key} className={`flex flex-col py-6 ${i !== 0 ? 'border-t border-gray-100' : ''}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-3">
                    <span className="text-[15px] font-medium text-[var(--ink)] w-full sm:w-[280px]">{agencyName}</span>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold shrink-0 ${perm.allowsAutoBook ? 'bg-[#E6EFEA] text-[#385B52]' : 'bg-[#F3F2EE] text-slate-500'}`}>
                      {perm.allowsAutoBook ? 'Auto Fill on' : 'Auto Fill off'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAutoBook(membership.agencyId, !perm.allowsAutoBook)}
                      disabled={!perm.sharesAvailability || Boolean(pendingKey)}
                      className="h-9 rounded-full border border-gray-200 px-5 text-[13px] font-medium text-slate-600 hover:bg-gray-50 transition-colors whitespace-nowrap disabled:text-slate-400 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Saving…' : perm.allowsAutoBook ? 'Turn off auto-book' : 'Allow this agency to auto-book'}
                    </button>
                  </div>
                  {!perm.sharesAvailability && (
                    <p className="text-[13px] text-[var(--sage)] max-w-4xl leading-relaxed">
                      Turn on 'Share my availability' for {agencyName} in the section above first.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Requests you have sent */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 md:p-8">
          <h2 className="text-[19px] font-semibold text-[var(--ink)] mb-6">Requests you have sent</h2>
          
          <div className="space-y-0">
            {myRequests.length === 0 ? (
              <p className="text-[15px] text-[var(--sage)]">No requests yet.</p>
            ) : (
              myRequests.map((req, i) => {
                const agency = agencies.find(a => a.id === req.agency_id);
                let stateColor = "bg-[#F3F2EE] text-slate-500";
                let stateText = "Pending";
                if (req.state === 'approved') {
                  stateColor = "bg-[#E6EFEA] text-[#385B52]";
                  stateText = "Approved";
                } else if (req.state === 'declined') {
                  stateColor = "bg-red-50 text-red-600";
                  stateText = "Declined";
                }

                return (
                  <div key={req.id} className={`flex flex-col sm:flex-row sm:items-center gap-4 py-4 ${i !== 0 ? 'border-t border-gray-100' : ''}`}>
                    <span className="text-[15px] font-medium text-[var(--ink)]">{agency?.name || 'Unknown Agency'}</span>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${stateColor}`}>
                      {stateText}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
