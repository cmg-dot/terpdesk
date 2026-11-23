"use client";

import { useEffect, useState } from "react";
import { getConnectedAgencyCount } from "@/app/actions/agencyConnections";

/**
 * How many agencies the signed-in interpreter is connected to (approved connections). `null` while it loads, so a screen can wait
 * before telling someone they have none; a failed read counts as 0.
 */
export function useConnectedAgencyCount(userId: string | undefined): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    getConnectedAgencyCount()
      .then((n) => { if (live) setCount(n); })
      .catch(() => { if (live) setCount(0); });
    return () => { live = false; };
  }, [userId]);
  return count;
}
