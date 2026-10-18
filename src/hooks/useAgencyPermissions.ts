"use client";

import { useCallback, useEffect, useState } from "react";
import { getMyAgencyPermissions } from "@/app/actions/getMyAgencyPermissions";
import { toggleAutoBook } from "@/app/actions/toggleAutoBook";
import { toggleAvailability } from "@/app/actions/toggleAvailability";
import type { ToggleResult } from "@/app/actions/toggleAvailability";
import { NO_PERMISSIONS } from "@/lib/agencyPermissionTypes";
import type { AgencyPermission } from "@/lib/agencyPermissionTypes";

/** Loads this interpreter's per-agency permissions and exposes the two toggles with pending/error state. */
export function useAgencyPermissions(enabled: boolean) {
  const [permissions, setPermissions] = useState<Record<string, AgencyPermission>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    getMyAgencyPermissions().then(setPermissions).catch(() => setPermissions({}));
  }, [enabled]);

  const run = useCallback(
    async (key: string, agencyId: string, call: () => Promise<ToggleResult>) => {
      if (pendingKey) return;
      setPendingKey(key);
      setError(null);
      try {
        const result = await call();
        if (result.success) setPermissions((prev) => ({ ...prev, [agencyId]: result.permission }));
        else setError(result.error);
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setPendingKey(null);
      }
    },
    [pendingKey],
  );

  return {
    permissionFor: (agencyId: string): AgencyPermission => permissions[agencyId] ?? NO_PERMISSIONS,
    pendingKey,
    error,
    setSharing: (agencyId: string, next: boolean) => run(`share:${agencyId}`, agencyId, () => toggleAvailability({ agencyId, enabled: next })),
    setAutoBook: (agencyId: string, next: boolean) => run(`auto:${agencyId}`, agencyId, () => toggleAutoBook({ agencyId, enabled: next })),
  };
}
