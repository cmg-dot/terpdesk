"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { openInboxEmail, setInboxEmailRead } from "@/app/actions/inbox";
import type { InboxEmail, InboxListItem } from "@/types/inbox";

const LOAD_FAILED = "We couldn't open that email. Please try again.";

/**
 * Selection and read state for the inbox. The list comes from the server; `readOverrides` holds what this browser has
 * just changed, so a click shows as read at once and a refresh of the server data (which is the truth) never fights it.
 */
export function useInbox(serverEmails: InboxListItem[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openEmail, setOpenEmail] = useState<InboxEmail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readOverrides, setReadOverrides] = useState<Record<string, boolean>>({});
  // Only the latest click may fill the reading pane, so a slow earlier response cannot replace it.
  const latestRequest = useRef<string | null>(null);

  const emails = useMemo(
    () => serverEmails.map((email) => (email.id in readOverrides ? { ...email, isRead: readOverrides[email.id] } : email)),
    [serverEmails, readOverrides],
  );
  const unreadCount = useMemo(() => emails.filter((email) => !email.isRead).length, [emails]);

  const setRead = useCallback((id: string, isRead: boolean) => setReadOverrides((prev) => ({ ...prev, [id]: isRead })), []);

  const select = useCallback(
    async (id: string) => {
      const wasRead = emails.find((email) => email.id === id)?.isRead ?? true;
      latestRequest.current = id;
      setSelectedId(id);
      setOpenEmail(null);
      setError(null);
      setIsLoading(true);
      setRead(id, true);
      try {
        const result = await openInboxEmail(id);
        if (latestRequest.current !== id) return;
        if (result.success) {
          setOpenEmail(result.email);
        } else {
          setRead(id, wasRead);
          setError(result.error);
        }
      } catch {
        if (latestRequest.current !== id) return;
        setRead(id, wasRead);
        setError(LOAD_FAILED);
      } finally {
        if (latestRequest.current === id) setIsLoading(false);
      }
    },
    [emails, setRead],
  );

  const markUnread = useCallback(async () => {
    if (!openEmail) return;
    const id = openEmail.id;
    setRead(id, false);
    try {
      const result = await setInboxEmailRead(id, false);
      if (!result.success) {
        setRead(id, true);
        setError(result.error);
      }
    } catch {
      setRead(id, true);
      setError(LOAD_FAILED);
    }
  }, [openEmail, setRead]);

  const close = useCallback(() => {
    latestRequest.current = null;
    setSelectedId(null);
    setOpenEmail(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { emails, unreadCount, selectedId, openEmail, isLoading, error, select, markUnread, close };
}
