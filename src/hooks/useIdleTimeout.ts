"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { recordIdleSignOut } from "@/app/actions/recordIdleSignOut";
import { clearClientCache } from "@/lib/clientCache";
import { IDLE_LIMIT_MS, IDLE_LOGIN_REASON, IDLE_TOUCH_INTERVAL_MS, IDLE_WARNING_LEAD_MS } from "@/lib/auth/idle";

/**
 * The browser half of the 30-minute idle sign-out (the server's half is lib/auth/idle.ts, which is what actually decides).
 *
 *  - Activity is tracked in refs only: the listeners never set state, so typing and scrolling cause no re-renders.
 *  - One timer, armed for the moment the warning is due; when it fires it re-reads the last activity and re-arms itself,
 *    so activity never has to reset a timer.
 *  - While the person is active, the server is told at most once a minute (update({ touch: true })).
 *  - Other tabs share activity and sign-out over a BroadcastChannel, so a busy tab keeps the others alive.
 *  - Once the warning is up, only its buttons count: ambient mouse movement behind the dialog does not dismiss it.
 * Fetches are never counted as activity and nothing here wraps or delays them.
 */

const CHANNEL_NAME = "terpdesk-idle";
const SIGNED_OUT_URL = `/login?reason=${IDLE_LOGIN_REASON}`;
const MOVE_SAMPLE_MS = 1000;
const BROADCAST_MS = 5000;
const AUDIT_WAIT_MS = 1500;

type ChannelMessage = { type: "activity"; at: number } | { type: "signout" };

export interface IdleTimeoutState {
  /** True while the "about to expire" dialog should be showing. */
  warning: boolean;
  /** Whole seconds until sign-out, while the warning is showing. */
  remainingSec: number;
  stay: () => void;
  signOutNow: () => void;
}

export function useIdleTimeout(): IdleTimeoutState {
  const { data: session, update } = useSession();
  const [warning, setWarning] = useState(false);
  const [remainingSec, setRemainingSec] = useState(Math.ceil(IDLE_WARNING_LEAD_MS / 1000));
  const updateRef = useRef(update);
  updateRef.current = update;
  // Reached from outside the effect (the dialog's buttons, and the session watcher below).
  const actions = useRef<{ stay: () => void; end: (record: boolean) => void }>({ stay: () => undefined, end: () => undefined });

  useEffect(() => {
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
    let lastActivity = Date.now();
    let lastPing = 0;
    let lastBroadcast = 0;
    let lastMove = 0;
    let warnedFor: number | null = null; // the sign-out deadline while the warning is up
    let ended = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;

    const stopTimers = () => {
      clearTimeout(timer);
      clearInterval(tick);
    };

    const finish = async (record: boolean) => {
      // The audit row is best effort and bounded: the sign-out never waits long for it.
      if (record) await Promise.race([recordIdleSignOut().catch(() => undefined), new Promise((r) => setTimeout(r, AUDIT_WAIT_MS))]);
      clearClientCache();
      await signOut({ callbackUrl: SIGNED_OUT_URL });
    };
    const end = (record: boolean) => {
      if (ended) return;
      ended = true;
      stopTimers();
      channel?.postMessage({ type: "signout" } satisfies ChannelMessage);
      void finish(record);
    };

    const ping = async () => {
      lastPing = Date.now();
      try {
        const next = await updateRef.current({ touch: true });
        // The server refused to extend a session that was already past the limit.
        if (next?.user?.idleExpired) end(true);
      } catch {
        // Offline or a hiccup: the next activity tries again, and the server's own check still applies.
      }
    };

    const broadcastActivity = (at: number) => {
      lastBroadcast = at;
      channel?.postMessage({ type: "activity", at } satisfies ChannelMessage);
    };

    const closeWarning = () => {
      warnedFor = null;
      clearInterval(tick);
      setWarning(false);
    };

    const schedule = () => {
      clearTimeout(timer);
      const wait = IDLE_LIMIT_MS - IDLE_WARNING_LEAD_MS - (Date.now() - lastActivity);
      timer = setTimeout(check, Math.max(wait, 0) + 50);
    };

    const openWarning = (deadline: number) => {
      warnedFor = deadline;
      setRemainingSec(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      setWarning(true);
      tick = setInterval(() => {
        const left = deadline - Date.now();
        if (left <= 0) end(true);
        else setRemainingSec(Math.ceil(left / 1000));
      }, 500);
    };

    function check() {
      if (ended) return;
      const idleFor = Date.now() - lastActivity;
      if (idleFor >= IDLE_LIMIT_MS) end(true);
      else if (idleFor >= IDLE_LIMIT_MS - IDLE_WARNING_LEAD_MS) {
        if (warnedFor === null) openWarning(lastActivity + IDLE_LIMIT_MS);
      } else schedule();
    }

    const mark = () => {
      if (warnedFor !== null || ended) return; // with the warning up, only its buttons count
      const now = Date.now();
      lastActivity = now;
      if (now - lastBroadcast >= BROADCAST_MS) broadcastActivity(now);
      if (now - lastPing >= IDLE_TOUCH_INTERVAL_MS) void ping();
    };
    const onMove = () => {
      const now = Date.now();
      if (now - lastMove < MOVE_SAMPLE_MS) return;
      lastMove = now;
      mark();
    };

    const stay = () => {
      if (warnedFor === null || ended) return;
      closeWarning();
      lastActivity = Date.now();
      broadcastActivity(lastActivity);
      schedule();
      void ping();
    };

    if (channel) {
      channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
        const message = event.data;
        if (message?.type === "activity" && typeof message.at === "number") {
          if (message.at <= lastActivity) return;
          lastActivity = message.at;
          // Someone is active in another tab: no warning needed here.
          if (warnedFor !== null) closeWarning();
          schedule();
        } else if (message?.type === "signout" && !ended) {
          ended = true;
          stopTimers();
          clearClientCache();
          void signOut({ callbackUrl: SIGNED_OUT_URL });
        }
      };
    }

    const listen = { capture: true, passive: true } as const;
    const downs = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const name of downs) document.addEventListener(name, mark, listen);
    document.addEventListener("pointermove", onMove, listen);
    // A sleeping laptop or a throttled background tab fires timers late: look again the moment the tab is back.
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    actions.current = { stay, end };
    schedule();
    void ping(); // opening a page is activity too

    return () => {
      stopTimers();
      for (const name of downs) document.removeEventListener(name, mark, listen);
      document.removeEventListener("pointermove", onMove, listen);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      channel?.close();
    };
  }, []);

  // The server can mark the session expired (a refetch, or a late ping): follow it at once.
  useEffect(() => {
    if (session?.user?.idleExpired) actions.current.end(true);
  }, [session]);

  const stay = useCallback(() => actions.current.stay(), []);
  const signOutNow = useCallback(() => actions.current.end(false), []);
  return { warning, remainingSec, stay, signOutNow };
}
