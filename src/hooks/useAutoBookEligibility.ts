"use client";

import { useEffect, useState } from "react";
import { getAutoBookEligibility } from "@/app/actions/getAutoBookEligibility";

/** Which of these interpreters allow this agency to auto-book them (read once per roster). Empty while loading or on error. */
export function useAutoBookEligibility(interpreterIds: string[]): Record<string, boolean> {
  const [allowed, setAllowed] = useState<Record<string, boolean>>({});
  const key = interpreterIds.join(",");
  useEffect(() => {
    let live = true;
    if (!key) return;
    getAutoBookEligibility(key.split(","))
      .then((map) => { if (live) setAllowed(map); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [key]);
  return allowed;
}
