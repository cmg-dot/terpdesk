"use client";

import { getInboxUnreadCount } from "@/app/actions/inbox";
import { usePolledCount } from "@/hooks/usePolledCount";

const INBOX_CHANGED = "terpdesk:inbox-changed";

/** Tells the sidebar badge to re-count now (called after an email is opened or set back to unread). */
export const notifyInboxChanged = (): void => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(INBOX_CHANGED));
};

/** The live number of unread inbox emails (see usePolledCount). */
export const useInboxUnreadCount = (): number => usePolledCount(getInboxUnreadCount, INBOX_CHANGED);
