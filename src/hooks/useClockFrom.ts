"use client";

import { useEffect, useState } from "react";

/**
 * A clock that starts at the time the server rendered the page (so the first browser render matches the server's HTML exactly), then
 * follows the real time: at once after the page loads, every minute, and when a hidden tab is shown again.
 */
export function useClockFrom(serverNow: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}
