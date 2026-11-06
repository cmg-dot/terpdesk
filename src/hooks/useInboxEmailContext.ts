"use client";

import { useEffect, useState } from "react";
import { getInboxEmailContext } from "@/app/actions/inbox";
import type { InboxEmailContext } from "@/types/inbox";

export interface InboxContextState {
  isLoading: boolean;
  context: InboxEmailContext | null;
  error: string | null;
}

const COULD_NOT_LOAD = "We couldn't look up the matching request. Please try again.";

/** The matched request and timesheets for an opened email (read-only). A slow answer for an email that is no longer open is dropped. */
export function useInboxEmailContext(emailId: string | null): InboxContextState {
  const [state, setState] = useState<InboxContextState>({ isLoading: Boolean(emailId), context: null, error: null });

  useEffect(() => {
    if (!emailId) {
      setState({ isLoading: false, context: null, error: null });
      return;
    }
    let cancelled = false;
    setState({ isLoading: true, context: null, error: null });
    getInboxEmailContext(emailId)
      .then((result) => {
        if (cancelled) return;
        setState(result.success ? { isLoading: false, context: result.context, error: null } : { isLoading: false, context: null, error: result.error });
      })
      .catch(() => {
        if (!cancelled) setState({ isLoading: false, context: null, error: COULD_NOT_LOAD });
      });
    return () => {
      cancelled = true;
    };
  }, [emailId]);

  return state;
}
