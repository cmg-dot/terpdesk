"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface IdleWarningDialogProps {
  open: boolean;
  remainingSec: number;
  onStay: () => void;
  onSignOut: () => void;
}

/** Seconds-remaining marks that are spoken to screen readers (the visible countdown itself is not, it would chatter every second). */
const ANNOUNCE_AT = [10, 30, 60, 120] as const;

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The "session about to expire" alert. It is deliberately not dismissible: no close button, and neither Escape nor a click
 * outside closes it, so the only ways out are the two buttons (or the countdown reaching zero). Focus starts on "Stay signed
 * in" and Tab stays inside the dialog.
 */
export const IdleWarningDialog = ({ open, remainingSec, onStay, onSignOut }: IdleWarningDialogProps) => {
  const stayRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    stayRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
      if (e.key !== "Tab") return;
      const buttons = panelRef.current?.querySelectorAll<HTMLElement>("button");
      if (!buttons || buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!panelRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const announceAt = ANNOUNCE_AT.find((mark) => remainingSec <= mark) ?? ANNOUNCE_AT[ANNOUNCE_AT.length - 1];

  return createPortal(
    <div data-idle-overlay className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-description"
        className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-xl sm:p-8"
      >
        <h2 id="idle-title" className="text-xl font-semibold tracking-tight text-gray-900">
          Are you still there?
        </h2>
        <p id="idle-description" className="mt-2 text-sm text-gray-600">
          Your session is about to expire due to inactivity. To protect health information, you will be signed out automatically.
        </p>
        <p className="mt-5 text-center text-sm text-gray-500" aria-hidden="true">
          Signing out in
          <span data-idle-countdown className="mt-1 block text-4xl font-semibold tabular-nums text-[var(--forest)]">
            {clock(remainingSec)}
          </span>
        </p>
        <p role="status" aria-live="polite" className="sr-only">
          {`Signing out in ${announceAt === 120 ? "2 minutes" : announceAt === 60 ? "1 minute" : `${announceAt} seconds`} or less.`}
        </p>
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-idle-signout
            onClick={onSignOut}
            className="rounded-full border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--forest-rgb)/0.4)]"
          >
            Sign out
          </button>
          <button
            ref={stayRef}
            type="button"
            data-idle-stay
            onClick={onStay}
            className="rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--forest-rgb)/0.5)] focus-visible:ring-offset-2"
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
