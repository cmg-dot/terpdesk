"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getInboxUnreadCount } from "@/app/actions/inbox";

const POLL_MS = 60_000;
const INBOX_CHANGED = "terpdesk:inbox-changed";

/** Tells the sidebar badge to re-count now (called after an email is opened or set back to unread). */
export const notifyInboxChanged = (): void => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(INBOX_CHANGED));
};

/**
 * The live number of unread inbox emails: loaded on sign-in, re-counted every minute while the tab is visible, when the
 * tab is shown again, and straight after the inbox changes. A failed count keeps the number already shown.
 */
export function useInboxUnreadCount(): number {
  const { status } = useSession();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setUnread(await getInboxUnreadCount());
    } catch {
      // Signed out or a transient error: keep what is shown.
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(INBOX_CHANGED, refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(INBOX_CHANGED, refresh);
    };
  }, [status, refresh]);

  return unread;
}
