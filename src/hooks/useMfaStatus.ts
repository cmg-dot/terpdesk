"use client";

import { useCallback, useEffect, useState } from "react";
import { getMfaStatus } from "@/app/actions/mfaStatus";
import type { MfaStatus } from "@/lib/mfa/types";

/** The signed-in agency login's two-step verification state, for the Settings card. `refresh` re-reads it after a change. */
export function useMfaStatus() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getMfaStatus());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, failed, refresh };
}
