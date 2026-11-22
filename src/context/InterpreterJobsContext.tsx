"use client";

import { settingLabel } from "@/lib/settingLabel";
import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { fetchInterpreterOffers } from "@/app/actions/getInterpreterOffers";
import { updateOfferStatus } from "@/app/actions/updateOfferStatus";
import { useGlobalState } from "@/context/GlobalContext";
import { useJobsResync } from "@/hooks/useJobsResync";
import { invalidateKey } from "@/lib/clientCache";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
import type { AcceptAnswersInput } from "@/lib/acceptAnswers";
import type { InterpreterCancellation } from "@/lib/interpreterCancellation";
import type { InterpreterNotes } from "@/lib/interpreterNotes";

export interface Job {
  id: string;
  requestId: string;
  positionIndex?: number;
  /** Their position's place in the job's own numbering ("Position N"), and how many positions the job has (2 or more = a team assignment). */
  positionOrdinal?: number;
  positionCount?: number;
  requestStatus?: string;
  title: string;
  dateString: string;
  status: 'pending' | 'booked' | 'declined' | 'released' | 'expired' | 'cancelled';
  location: string;
  isVirtual: boolean;
  hasAutoFill?: boolean;
  startsAt?: string;
  endsAt?: string;
  /** The offer's response deadline (lib/interpreterJobBuckets.ts hides a pending offer past it). */
  offerExpiresAt?: string | null;
  serviceRecordState?: 'not_started' | 'submitted' | 'approved';
  program?: string;
  isStateJob?: boolean;
  /** The job needs the on-site contact's printed name and signature when hours are submitted (never for a state job). */
  onsiteSignatureRequired?: boolean;
  timeZone?: string;
  hoursSubmission?: any;
  /** Two-interpreter job: request-wide hours status/travel must never be used for this interpreter's hours. */
  isTeamJob?: boolean;
  /** The agency changed the job after this interpreter was booked (drives the "Updated" badge). */
  detailsUpdated?: { at: string; fields: string[] } | null;
  travelStartTime?: string | null;
  travelEndTime?: string | null;
  serviceCompleted?: boolean | null;
  setting?: string;
  format?: string;
  meetingLink?: string | null;
  virtualLink?: string | null;
  meetingId?: string | null;
  passcode?: string | null;
  accessCode?: string | null;
  platform?: string | null;
  virtualInstructions?: string | null;
  /** The client's name: only present once the interpreter is booked on the job. */
  clientName?: string | null;
  /** An offer for a virtual job whose link and passcode are withheld until it is accepted. */
  credentialsLocked?: boolean;
  /** The agency's preparation notes, once the interpreter is booked. */
  prepNotes?: string;
  /** A live offer's appointment notes, scrubbed of the client's details on the server (lib/offerNotes.ts). */
  offerNotes?: string;
  offerNotesRemoved?: boolean; // the agency wrote notes but the scrub removed all of them from this live offer
  cancellation?: InterpreterCancellation | null; // a cancelled booking's billing verdict (billing on only): the pill and the way to its form
  /** A mental health appointment (the yes / no only). */
  mentalHealth?: boolean;
  /** The agency's pinned booking notes for the team, once the interpreter is booked. */
  interpreterNotes?: InterpreterNotes | null;
  /** The state form's Public / Mixed Group answers (null when it did not say). */
  groupFlags?: { isPublic: boolean | null; isMixedGroup: boolean | null };
  agencyName?: string;
  details?: any;
  onsite?: any;
  data?: any;
}

interface InterpreterJobsContextType {
  jobs: Job[];
  /** Re-reads the interpreter's jobs from the server (the Jobs page's refresh button). */
  refreshJobs: () => Promise<void>;
  /** Accepts an offer with the interpreter's travel-time answer and optional availability note (lib/acceptAnswers.ts). */
  acceptJobOffer: (jobId: string, answers: AcceptAnswersInput) => Promise<void>;
  declineOffer: (jobId: string) => Promise<void>;
  releaseJob: (jobId: string, reason?: string) => void;
  markJobReleased: (jobId: string) => void;
  submitHours: (jobId: string) => void;
}

const InterpreterJobsContext = createContext<InterpreterJobsContextType | undefined>(undefined);

export function InterpreterJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const { currentUser } = useGlobalState();

  const reloadJobs = async () => {
    if (currentUser?.email) {
      try {
        const offers = await fetchInterpreterOffers(currentUser.email);
        const mappedJobs: Job[] = offers.map(o => ({
          id: o.id,
          requestId: o.requestId,
          positionIndex: (o as any).positionIndex || 1,
          positionOrdinal: (o as any).positionOrdinal,
          positionCount: (o as any).positionCount,
          requestStatus: o.requestStatus,
          title: o.title || "Interpreter Request",
          dateString: o.startsAt ? new Date(o.startsAt).toLocaleString() : "Date TBD",
          status: o.status === 'accepted' ? 'booked' : o.status as any,
          location: o.location || (o.isVirtual ? "Virtual" : (o.agencyName || "Remote")),
          isVirtual: o.isVirtual ?? true,
          startsAt: o.startsAt,
          endsAt: o.endsAt,
          offerExpiresAt: o.offerExpiresAt,
          program: o.program,
          isStateJob: (o as any).isStateJob === true,
          onsiteSignatureRequired: (o as any).onsiteSignatureRequired === true,
          timeZone: o.timeZone,
          hoursSubmission: (o as any).hoursSubmission,
          isTeamJob: o.isTeamJob,
          detailsUpdated: o.detailsUpdated,
          travelStartTime: (o as any).travelStartTime,
          travelEndTime: (o as any).travelEndTime,
          serviceCompleted: (o as any).serviceCompleted,
          setting: settingLabel(o.setting, o.details?.setting),
          format: o.format || (o.isVirtual ? "Virtual" : "In person"),
          meetingLink: o.meetingLink || o.virtualLink || null,
          virtualLink: o.meetingLink || o.virtualLink || null,
          meetingId: o.meetingId || null,
          passcode: o.passcode || o.accessCode || null,
          accessCode: o.passcode || o.accessCode || null,
          platform: o.platform || null,
          virtualInstructions: o.virtualInstructions || null,
          clientName: o.clientName || null,
          credentialsLocked: o.credentialsLocked,
          prepNotes: o.prepNotes,
          offerNotes: o.offerNotes,
          offerNotesRemoved: o.offerNotesRemoved === true,
          cancellation: o.cancellation,
          mentalHealth: o.mentalHealth === true,
          interpreterNotes: o.interpreterNotes,
          groupFlags: o.groupFlags,
          agencyName: o.agencyName || DEFAULT_AGENCY_NAME,
          details: o.details || {},
          onsite: o.onsite || {},
          data: o.data || {}
        }));
        setJobs(mappedJobs);
      } catch (e) {
        console.error("[context/InterpreterJobsContext] operation failed");
      }
    }
  };

  useEffect(() => {
    if (currentUser?.email) {
      reloadJobs().finally(() => setIsMounted(true));
    } else {
      setIsMounted(true);
    }
  }, [currentUser?.email]);

  // Re-read the jobs on the 15-second pulse, on focus, and once a minute (hooks/useJobsResync.ts).
  useJobsResync(Boolean(currentUser?.email), reloadJobs);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('terpdesk_interpreter_jobs', JSON.stringify(jobs));
    }
  }, [jobs, isMounted]);

  const acceptJobOffer = async (jobId: string, answers: AcceptAnswersInput) => {
    try {
      const result = await updateOfferStatus(jobId, 'accepted', answers);
      // Expected refusals (busy-time conflict, expired, withdrawn) come back as { success: false, error }.
      // Raised here, in the browser, so the callers' existing error banners show the real message.
      if ('success' in result && !result.success) throw new Error(result.error);
      setJobs(prevJobs => prevJobs.map(job =>
        job.id === jobId ? { ...job, status: 'booked' } : job
      ));
      invalidateKey("dashboard-summary");
    } catch (err: any) {
      // If offer expired or rejected, reload to sync updated DB state
      await reloadJobs();
      throw err;
    }
    // The flip above shows "Booked" at once. The booking's details (meeting link, parking, client, prep and booking notes) are
    // never sent with an offer, so they are read now instead of on the next sync.
    await reloadJobs();
  };

  const declineOffer = async (jobId: string) => {
    try {
      const result = await updateOfferStatus(jobId, 'declined');
      if ('success' in result && !result.success) throw new Error(result.error);
      setJobs(prevJobs => prevJobs.map(job =>
        job.id === jobId ? { ...job, status: 'declined' } : job
      ));
      // Anything cached in this tab that counted this offer (the dashboard's offers-out figure) is now out of date.
      invalidateKey("dashboard-summary");
    } catch (err: any) {
      await reloadJobs();
      throw err;
    }
  };

  const markJobReleased = (jobId: string) => {
    setJobs(prevJobs => prevJobs.map(job =>
      job.id === jobId ? { ...job, status: 'released' } : job
    ));
  };

  const releaseJob = (jobId: string, reason?: string) => {
    setJobs(prevJobs => prevJobs.map(job => 
      job.id === jobId ? { ...job, status: 'released' } : job
    ));
    
    const requestsStr = localStorage.getItem('terpdesk_requests');
    if (requestsStr) {
      try {
        const requests = JSON.parse(requestsStr);
        const reqIndex = requests.findIndex((r: any) => r.id === jobId);
        if (reqIndex > -1) {
          const req = requests[reqIndex];
          if (req.slots && Array.isArray(req.slots)) {
            const slotIndex = req.slots.findIndex((s: any) => s.reservedBy);
            if (slotIndex > -1) {
               req.slots[slotIndex].reservedBy = null;
               req.slots[slotIndex].needsReplacement = true;
               if (reason) req.slots[slotIndex].releaseReason = reason;
            } else {
               req.slots.push({ id: `slot-${Date.now()}`, active: true, reservedBy: null, needsReplacement: true, releaseReason: reason });
            }
          } else {
             req.slots = [{ id: `slot-${Date.now()}`, active: true, reservedBy: null, needsReplacement: true, releaseReason: reason }];
          }
          
          if (req.offers && Array.isArray(req.offers)) {
             req.offers = req.offers.map((o: any) => o.state === 'accepted' ? { ...o, state: 'released' } : o);
          }
          
          requests[reqIndex] = req;
          localStorage.setItem('terpdesk_requests', JSON.stringify(requests));
        }
      } catch (e) {}
    }

    const offersStr = localStorage.getItem('terpdesk_offers');
    if (offersStr) {
       try {
          const offers = JSON.parse(offersStr);
          const updatedOffers = offers.map((o: any) => o.id === jobId ? { ...o, status: 'released' } : o);
          localStorage.setItem('terpdesk_offers', JSON.stringify(updatedOffers));
       } catch (e) {}
    }
    
    window.dispatchEvent(new Event('storage'));
  };

  const submitHours = (jobId: string) => {
    setJobs(prevJobs => prevJobs.map(job => 
      job.id === jobId ? { ...job, serviceRecordState: 'submitted' } : job
    ));
    window.dispatchEvent(new Event('storage'));
  };

  if (!isMounted) return null;

  return (
    <InterpreterJobsContext.Provider value={{ jobs, refreshJobs: reloadJobs, acceptJobOffer, declineOffer, releaseJob, markJobReleased, submitHours }}>
      {children}
    </InterpreterJobsContext.Provider>
  );
}

export function useInterpreterJobs() {
  const context = useContext(InterpreterJobsContext);
  if (!context) {
    throw new Error("useInterpreterJobs must be used within an InterpreterJobsProvider");
  }
  return context;
}
