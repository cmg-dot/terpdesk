"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { fetchInterpreterOffers } from "@/app/actions/getInterpreterOffers";
import { updateOfferStatus } from "@/app/actions/updateOfferStatus";
import { useGlobalState } from "@/context/GlobalContext";

export interface Job {
  id: string;
  requestId: string;
  requestStatus?: string;
  title: string;
  dateString: string;
  status: 'pending' | 'booked' | 'declined' | 'released';
  location: string;
  isVirtual: boolean;
  hasAutoFill?: boolean;
  startsAt?: string;
  endsAt?: string;
  serviceRecordState?: 'not_started' | 'submitted' | 'approved';
  program?: string;
  timeZone?: string;
  hoursSubmission?: any;
  travelStartTime?: string | null;
  travelEndTime?: string | null;
  serviceCompleted?: boolean | null;
}

interface InterpreterJobsContextType {
  jobs: Job[];
  acceptJobOffer: (jobId: string) => Promise<void>;
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

  useEffect(() => {
    if (currentUser?.email) {
      fetchInterpreterOffers(currentUser.email).then(offers => {
        const mappedJobs = offers.map(o => ({
          id: o.id,
          requestId: o.requestId,
          requestStatus: o.requestStatus,
          title: o.title || "Interpreter Request",
          dateString: o.startsAt ? new Date(o.startsAt).toLocaleString() : "Date TBD",
          status: o.status === 'accepted' ? 'booked' : o.status as any,
          location: o.agencyName || "Remote",
          isVirtual: true,
          startsAt: o.startsAt,
          endsAt: o.endsAt,
          program: o.program,
          timeZone: o.timeZone,
          hoursSubmission: (o as any).hoursSubmission,
          travelStartTime: (o as any).travelStartTime,
          travelEndTime: (o as any).travelEndTime,
          serviceCompleted: (o as any).serviceCompleted,
        }));
        setJobs(mappedJobs);
        setIsMounted(true);
      }).catch(e => {
        console.error(e);
        setIsMounted(true);
      });
    } else {
      setIsMounted(true);
    }
  }, [currentUser?.email]);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('terpdesk_interpreter_jobs', JSON.stringify(jobs));
    }
  }, [jobs, isMounted]);

  const acceptJobOffer = async (jobId: string) => {
    setJobs(prevJobs => prevJobs.map(job => 
      job.id === jobId ? { ...job, status: 'booked' } : job
    ));
    await updateOfferStatus(jobId, 'accepted');
  };

  const declineOffer = async (jobId: string) => {
    setJobs(prevJobs => prevJobs.map(job => 
      job.id === jobId ? { ...job, status: 'declined' } : job
    ));
    await updateOfferStatus(jobId, 'declined');
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
    <InterpreterJobsContext.Provider value={{ jobs, acceptJobOffer, declineOffer, releaseJob, markJobReleased, submitHours }}>
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
