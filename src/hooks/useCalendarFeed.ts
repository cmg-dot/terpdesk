"use client";

import { useCallback, useEffect, useState } from "react";
import { createCalendarFeed, getMyCalendarFeed, revokeCalendarFeed, rotateCalendarFeed, setCalendarFeedDetail } from "@/app/actions/calendarFeed";
import type { FeedChange, FeedState } from "@/app/actions/calendarFeed";
import type { FeedDetailLevel } from "@/lib/calendarFeed/events";

export type FeedBusy = "create" | "rotate" | "revoke" | "detail" | null;

/**
 * The Calendar page's subscription card: where the subscription stands, and the four things the interpreter can do to it. The address
 * (`url`) is only ever held here after a create or a rotate, in memory, for as long as the card is open: the server never has it again.
 */
export function useCalendarFeed() {
  const [state, setState] = useState<FeedState | "loading">("loading");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<FeedBusy>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMyCalendarFeed()
      .then((next) => alive && setState(next))
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, []);

  const run = useCallback(async (kind: Exclude<FeedBusy, null>, call: () => Promise<FeedChange>, keepUrl: boolean) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      const result = await call();
      if (result.success) {
        setState(result.state);
        if (result.url) setUrl(result.url);
        else if (!keepUrl) setUrl(null);
      } else setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }, [busy]);

  return {
    state,
    url,
    busy,
    error,
    create: (level: FeedDetailLevel) => run("create", () => createCalendarFeed(level), false),
    rotate: () => run("rotate", rotateCalendarFeed, false),
    revoke: () => run("revoke", revokeCalendarFeed, false),
    setDetail: (level: FeedDetailLevel) => run("detail", () => setCalendarFeedDetail(level), true),
  };
}
