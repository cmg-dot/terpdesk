"use client";

import { useEffect, useState } from "react";

/** The current time in ms, refreshed every minute: the heartbeat for "Live now" and past-appointment styling. */
export const useMinuteClock = (): number => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return nowMs;
};
