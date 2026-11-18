"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { PANEL } from "@/lib/hoursMotion";

interface Props {
  /** What the folded row shows (plain content: it sits inside the toggle button, so no links or controls in it). */
  header: ReactNode;
  /** Controlled open state (an "Expand all" toggle); leave out to let the section keep its own. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The section's outer box (border, background, rounding). */
  className?: string;
  /** The toggle row's padding. */
  headerClassName?: string;
  /** The opened body's padding and divider. */
  bodyClassName?: string;
  /** A name for tests and styling hooks (data-expandable). */
  name?: string;
  children: ReactNode;
}

/**
 * A section that folds away behind its header row and opens by height with a short fade (the Hours review's motion: PANEL and
 * useHoursMotion, so reduced-motion users get no travel). The body's overflow is hidden only while it moves, so a dropdown menu or a
 * focus ring inside an opened section is never clipped. The header is a real button (aria-expanded / aria-controls).
 */
export function Expandable({ header, open, defaultOpen = false, onOpenChange, className = "", headerClassName = "px-5 py-4", bodyClassName = "", name, children }: Props) {
  const [own, setOwn] = useState(defaultOpen);
  const isOpen = open ?? own;
  const bodyId = useId();
  const { transition } = useHoursMotion();
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setOwn(next);
    onOpenChange?.(next);
  };

  return (
    <div className={className} data-expandable={name} data-open={isOpen ? "true" : "false"}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        className={`flex w-full items-center gap-3 rounded-[inherit] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--forest)] ${headerClassName}`}
      >
        <span className="min-w-0 flex-1">{header}</span>
        <ChevronDown className={`h-5 w-5 flex-none text-[var(--forest)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div key="body" id={bodyId} initial={PANEL.initial} animate={PANEL.animate} exit={PANEL.exit} transition={transition()}>
            <div className={bodyClassName}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
