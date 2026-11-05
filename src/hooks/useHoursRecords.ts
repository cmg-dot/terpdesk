"use client";

import { useEffect, useState } from "react";
import { fetchLiveRequests } from "@/app/actions/getRequests";
import { getSubmittedTimesheets } from "@/app/actions/getSubmittedTimesheets";
import type { SubmittedTimesheet } from "@/app/actions/getSubmittedTimesheets";
import { mergeHoursRecords } from "@/utils/hoursReviewRecords";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

const STORAGE_KEY = "terpdesk_service_records";

// Signatures are sensitive and large; keep them out of localStorage (the database is the source of truth).
const withoutSignatures = (list: ServiceRecord[]): ServiceRecord[] =>
  list.map((r) => (r.signatureDataUrl ? { ...r, signatureDataUrl: null } : r));

/**
 * Hours review's records: the live requests and submitted timesheets merged with the browser's cached copy. They load when the
 * page opens and again on every "storage" event (the page fires one after a log, an assignment or an approval). `updateRecord`
 * swaps in one changed record, caches the list and tells the rest of the page to reload.
 */
export function useHoursRecords() {
  const [records, setRecords] = useState<ServiceRecord[]>([]);

  useEffect(() => {
    const loadRecords = async () => {
      let localRecords: ServiceRecord[] = [];
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            localRecords = JSON.parse(stored);
          } catch (e) {
            console.error("Failed to parse records");
          }
        }
      }
      try {
        const [dbRequests, submitted] = await Promise.all([
          fetchLiveRequests(),
          getSubmittedTimesheets().catch((): SubmittedTimesheet[] => []),
        ]);
        const merged = mergeHoursRecords({ localRecords, requests: dbRequests, timesheets: submitted });
        setRecords(merged);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutSignatures(merged)));
        }
      } catch (e) {
        console.error("Failed to fetch live requests for hours review");
        setRecords(localRecords);
      }
    };
    loadRecords();
    window.addEventListener("storage", loadRecords);
    return () => window.removeEventListener("storage", loadRecords);
  }, []);

  const updateRecord = (updatedRecord: ServiceRecord) => {
    const newRecords = records.map((r) => (r.id === updatedRecord.id ? updatedRecord : r));
    setRecords(newRecords);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutSignatures(newRecords)));
      window.dispatchEvent(new Event("storage"));
    }
  };

  return { records, updateRecord };
}
