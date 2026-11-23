"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const POLL_MS = 60_000;

/**
 * A live number for a sidebar badge: loaded on sign-in, re-counted every minute while the tab is visible, when the tab is shown again,
 * when `changedEvent` is fired on the window and whenever `refreshKey` changes (for example the page the person moved to). A failed
 * count keeps the number already shown. `load` must be a stable function (a module-level server action).
 */
export function usePolledCount(load: () => Promise<number>, changedEvent?: string, refreshKey?: string): number {
  const { status } = useSession();
  const [value, setValue] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setValue(await load());
    } catch {
      // Signed out or a transient error: keep what is shown.
    }
  }, [load]);

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
    if (changedEvent) window.addEventListener(changedEvent, refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (changedEvent) window.removeEventListener(changedEvent, refresh);
    };
  }, [status, refresh, changedEvent, refreshKey]);

  return value;
}
