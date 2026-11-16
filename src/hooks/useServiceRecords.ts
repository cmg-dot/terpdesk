"use client";

import { useCallback, useEffect, useState } from "react";

export type ServiceRecord = Record<string, unknown>;

const KEY = "terpdesk_service_records";

/** The hours drafts this browser keeps (localStorage), re-read when another tab changes them. `reload` re-reads on demand. */
export function useServiceRecords(): { records: ServiceRecord[]; reload: () => void } {
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const reload = useCallback(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      setRecords(Array.isArray(parsed) ? parsed.filter((r): r is ServiceRecord => typeof r === "object" && r !== null) : []);
    } catch {
      setRecords([]);
    }
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, [reload]);
  return { records, reload };
}
