"use client";

import { useEffect, useState } from "react";
import { getRequestActivity } from "@/app/actions/requestActivity";
import type { ActivityItem } from "@/lib/requestActivity";
import { ActivityLog } from "@/components/requests/ActivityLog";

/**
 * Agency request page: the live activity log from the database. `refreshKey` changes (e.g. the request's updatedAt)
 * re-fetch it, so an edit, offer or cancellation shows up without a reload.
 */
export function RequestActivityCard({
  requestId,
  timeZone,
  refreshKey,
  cardClass,
}: {
  requestId: string;
  timeZone: string;
  refreshKey?: string | number;
  cardClass: string;
}) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRequestActivity(requestId)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setItems(result.items);
          setError(null);
        } else {
          setError(result.error);
        }
      })
      .catch(() => {
        if (!cancelled) setError("We could not load the activity for this request.");
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, refreshKey]);

  return (
    <div className={cardClass}>
      <h2 className="text-[18px] font-medium text-[var(--ink)] mb-1">Activity</h2>
      <p className="mb-4 text-xs text-[var(--sage)]">Entries tagged “Shared” are also shown to booked interpreters on their secure job page.</p>
      {error ? (
        <p role="alert" className="text-sm text-red-700">{error}</p>
      ) : items === null ? (
        <p className="text-sm text-[var(--sage)]">Loading activity…</p>
      ) : (
        <ActivityLog items={items} timeZone={timeZone} showInterpreterNames emptyText="No activity recorded yet. New actions on this request are logged here." />
      )}
    </div>
  );
}
