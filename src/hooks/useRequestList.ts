"use client";

import { fetchRequestList } from "@/app/actions/getRequestList";
import { useCachedAction } from "@/hooks/useCachedAction";
import type { RequestListRow } from "@/lib/requestListRow";

const NO_REQUESTS: RequestListRow[] = [];

export interface RequestListState {
  /** Every request as a lean row; empty until the first read arrives. */
  requests: RequestListRow[];
  /** The list has arrived at least once (it may be empty). */
  loaded: boolean;
}

/**
 * The request list for the Requests page and the calendar. They share ONE cached answer (see useCachedAction), so moving between them,
 * or back from the dashboard, shows the list at once and refreshes it quietly.
 */
export function useRequestList(): RequestListState {
  const { data } = useCachedAction<RequestListRow[]>("request-list", fetchRequestList);
  return { requests: data ?? NO_REQUESTS, loaded: data !== undefined };
}
