"use client";

import { useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";
import { acceptedAlertLine } from "@/lib/acceptedOfferAlert";
import type { AcceptedOfferAlert } from "@/lib/acceptedOfferAlert";

/** How long a toast stays when nobody is pointing at it or tabbing through it. */
const DURATION_MS = 6000;

interface Props {
  alert: AcceptedOfferAlert;
  /** Closed, followed to Staffing, or timed out. */
  onFinish: () => void;
}

/**
 * One "Offer accepted" toast: slides down with a spring, frosted white card, the booking line ("Christy accepted SRN #... · 2 hr
 * travel requested · still needs a team interpreter"), the availability note, "Staffing →" and a close button. It leaves after 6 s,
 * and the clock stops while the pointer is over it or focus is inside it. Escape closes it.
 */
export function AcceptedOfferToast({ alert, onFinish }: Props) {
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const remaining = useRef(DURATION_MS);
  const finish = useRef(onFinish);
  finish.current = onFinish;

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => finish.current(), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [paused]);

  const onBlur = (e: FocusEvent<HTMLLIElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.key === "Escape") onFinish();
  };

  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -28, scale: 0.96 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      data-accepted-offer-toast=""
      className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/60 bg-white/80 p-4 text-sm text-[var(--ink)] shadow-[0_12px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Offer accepted</p>
          <p className="mt-0.5 break-words text-[13px] leading-snug text-slate-700">{acceptedAlertLine(alert)}</p>
          {alert.availabilityNote && (
            <p className="mt-1 break-words text-[12px] text-[var(--sage)]">Availability: &ldquo;{alert.availabilityNote}&rdquo;</p>
          )}
          <Link
            href={`/requests/${alert.requestId}#staffing`}
            onClick={onFinish}
            className="mt-2 inline-flex rounded-full bg-[var(--forest)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--forest-hover)]"
          >
            Staffing →
          </Link>
        </div>
        <button type="button" onClick={onFinish} aria-label="Dismiss" className="-m-1 shrink-0 rounded-full p-1 text-slate-500 hover:bg-black/5 hover:text-slate-800">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </motion.li>
  );
}
