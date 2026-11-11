"use client";

import { useEffect, useState } from "react";
import { fetchHoursReviewData } from "@/app/actions/getHoursReviewData";
import { mergeHoursRecords } from "@/utils/hoursReviewRecords";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

const STORAGE_KEY = "terpdesk_service_records";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Signatures are sensitive and large; keep them out of localStorage (the database is the source of truth).
const withoutSignatures = (list: ServiceRecord[]): ServiceRecord[] =>
  list.map((r) => (r.signatureDataUrl ? { ...r, signatureDataUrl: null } : r));

/**
 * Hours review's records: the submitted timesheets and the requests that hold hours (only those, not every request), merged with the
 * browser's cached copy. They load when the
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
        // The cached records name the jobs they are about, so the server includes those jobs: each cached record is then kept or
        // dropped by whether its job still exists, exactly as when every request was loaded.
        const cachedIds = Array.from(new Set(localRecords.map((r) => r.appointmentId).filter((id) => UUID_PATTERN.test(id))));
        const { requests, timesheets } = await fetchHoursReviewData(cachedIds);
        const merged = mergeHoursRecords({ localRecords, requests, timesheets });
        setRecords(merged);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutSignatures(merged)));
        }
      } catch (e) {
        console.error("Failed to load hours review data");
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
