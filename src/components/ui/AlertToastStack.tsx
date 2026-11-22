"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarCheck, CalendarClock, CalendarMinus, CalendarPlus, CalendarX, Hourglass, MessageCircleQuestion, MessageCircleReply, UserMinus, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AlertToast } from "@/lib/pulse";

/** One look per notification kind (lib/bannerKinds.ts): the circle's colour and icon. Anything else gets the neutral one. */
const LOOK: Record<string, { icon: LucideIcon; badge: string }> = {
  booking_added: { icon: CalendarPlus, badge: "bg-emerald-100 text-emerald-800" },
  booking_cancelled: { icon: CalendarX, badge: "bg-red-100 text-red-800" },
  booking_removed: { icon: CalendarMinus, badge: "bg-red-100 text-red-800" },
  booking_time_changed: { icon: CalendarClock, badge: "bg-amber-100 text-amber-900" },
  question_answered: { icon: MessageCircleReply, badge: "bg-sky-100 text-sky-800" },
  offer_accepted: { icon: CalendarCheck, badge: "bg-emerald-100 text-emerald-800" },
  offer_declined: { icon: UserMinus, badge: "bg-red-100 text-red-800" },
  offer_expired: { icon: Hourglass, badge: "bg-amber-100 text-amber-900" },
  offer_question: { icon: MessageCircleQuestion, badge: "bg-amber-100 text-amber-900" },
};
const NEUTRAL = { icon: MessageCircleQuestion, badge: "bg-gray-100 text-gray-700" };

interface Props {
  toasts: readonly AlertToast[];
  /** The toast was clicked: go to its job or section (and close it). */
  onOpen: (toast: AlertToast) => void;
  onClose: (id: string) => void;
}

/**
 * The floating pop-ups for newly arrived alerts, bottom right (the full width of a phone, with a margin): a rounded card with a coloured
 * icon, the notice's own title and message, and a close button, sliding in like a chat message. The persistent top banners stay as they
 * are; this only announces a new one. Never takes focus.
 */
export function AlertToastStack({ toasts, onOpen, onClose }: Props) {
  const reduce = useReducedMotion();
  return (
    <div
      role="region"
      aria-label="New alerts"
      aria-live="polite"
      data-alert-toasts=""
      className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 max-sm:inset-x-4 max-sm:w-auto"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const look = LOOK[toast.kind] ?? NEUTRAL;
          const Icon = look.icon;
          return (
            <motion.div
              key={toast.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40 }}
              transition={{ duration: reduce ? 0 : 0.22 }}
              data-alert-toast={toast.kind}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl"
            >
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${look.badge}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <button type="button" onClick={() => onOpen(toast)} className="min-w-0 flex-1 text-left max-sm:min-h-11">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-[var(--ink)]">{toast.title}</span>
                  <span className="shrink-0 text-[11px] text-[var(--sage)]">now</span>
                </span>
                <span className="mt-0.5 line-clamp-3 block break-words text-[13px] leading-snug text-gray-700">{toast.message}</span>
              </button>
              <button type="button" onClick={() => onClose(toast.id)} aria-label={`Dismiss: ${toast.title}`} className="shrink-0 rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 max-sm:min-h-11 max-sm:min-w-11">
                <X className="mx-auto h-4 w-4" aria-hidden="true" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
