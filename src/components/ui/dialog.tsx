"use client";

import { createContext, useContext, useEffect, useId, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Small accessible dialog with the same shape as Shadcn's Dialog API
 * (Dialog / DialogTrigger / DialogContent / DialogHeader / DialogTitle / DialogDescription).
 * The project has no Radix or Shadcn dependency, so this is a dependency-free equivalent.
 */

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);

const useDialog = (): DialogContextValue => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("Dialog components must be used inside <Dialog>.");
  return ctx;
};

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  const base = useId();
  return (
    <DialogContext.Provider
      value={{ open, setOpen: onOpenChange, titleId: `${base}-title`, descriptionId: `${base}-description` }}
    >
      {children}
    </DialogContext.Provider>
  );
};

export const DialogTrigger = ({ children, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => {
  const { setOpen } = useDialog();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(e) => {
        onClick?.(e);
        setOpen(true);
      }}
      {...props}
    >
      {children}
    </button>
  );
};

export const DialogContent = ({ children, className = "" }: { children: ReactNode; className?: string }) => {
  const { open, setOpen, titleId, descriptionId } = useDialog();
  const panelRef = useRef<HTMLDivElement>(null);
  // Parents usually pass a fresh onOpenChange every render. Reading it through a ref keeps the effect
  // below from re-running on every keystroke (which re-focused the first input each time).
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-dialog-close])")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenRef.current(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  // Portaled to <body> so an animated (transformed) ancestor cannot break `position: fixed`.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`relative w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-6 shadow-xl sm:p-8 ${className}`}
      >
        <button
          type="button"
          data-dialog-close
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export const DialogHeader = ({ children }: { children: ReactNode }) => <div className="mb-6 space-y-1.5 pr-8">{children}</div>;

export const DialogTitle = ({ children }: { children: ReactNode }) => {
  const { titleId } = useDialog();
  return (
    <h2 id={titleId} className="text-xl font-semibold tracking-tight text-gray-900">
      {children}
    </h2>
  );
};

export const DialogDescription = ({ children }: { children: ReactNode }) => {
  const { descriptionId } = useDialog();
  return (
    <p id={descriptionId} className="text-sm text-gray-500">
      {children}
    </p>
  );
};

export const DialogFooter = ({ children }: { children: ReactNode }) => (
  <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{children}</div>
);
