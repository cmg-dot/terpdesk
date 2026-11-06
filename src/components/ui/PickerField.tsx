"use client";

import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { POPOVER_CLASS, SCROLLBAR_CLASS } from "@/components/ui/popoverStyles";
import { measureAnchor, useAnchoredPanel } from "@/hooks/useAnchoredPanel";
import { menuPosition } from "@/lib/dropdown";
import type { Anchor, PlaceOptions } from "@/lib/dropdown";

/** The tallest a picker gets before it scrolls inside itself (the calendar is about 360px). */
const POPOVER_MAX_HEIGHT = 480;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface PopoverProps {
  anchor: Anchor;
  label: string;
  buttonRef: RefObject<HTMLElement>;
  rootRef: RefObject<HTMLElement>;
  onAnchor: (anchor: Anchor) => void;
  /** Closed by a press outside or by the page scrolling the button away: focus stays where the person put it. */
  onClose: () => void;
  /** Closed from inside (Escape): focus returns to the button. */
  onEscape: () => void;
  /** Open with a quick spring and leave with a fade (the pickers that opt in; the default is a plain fade-in). */
  spring: boolean;
  align: PlaceOptions["align"];
  edge: number | undefined;
  children: ReactNode;
}

const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.8 } as const;

/** The floating panel: portalled to <body>, fixed to the screen at z-[9999], cream with a border and a deep shadow. */
const Popover = ({ anchor, label, buttonRef, rootRef, onAnchor, onClose, onEscape, spring, align, edge, children }: PopoverProps) => {
  const reduceMotion = useReducedMotion();
  const { panel, placement } = useAnchoredPanel<HTMLDivElement>({ anchor, buttonRef, rootRef, onAnchor, onClose, maxHeight: POPOVER_MAX_HEIGHT, align, edge });
  const drift = reduceMotion ? 0 : placement.flipUp ? 5 : -5;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Keep a surrounding dialog from also treating this Escape as "close me".
      event.preventDefault();
      event.stopPropagation();
      onEscape();
    } else if (event.key === "Tab") {
      // Keep Tab inside the picker while it is open: wrap from the last control to the first and back.
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (items.length > 0 && (event.shiftKey ? at <= 0 : at === items.length - 1)) {
        event.preventDefault();
        items[event.shiftKey ? items.length - 1 : 0].focus();
      }
    }
  };

  return createPortal(
    <motion.div
      ref={panel}
      role="dialog"
      aria-label={label}
      initial={spring ? { opacity: 0, y: drift, scale: 0.96 } : { opacity: 0, y: drift }}
      animate={spring ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0 }}
      exit={spring ? { opacity: 0, y: drift / 2, scale: 0.98, transition: { duration: 0.1, ease: "easeIn" } } : undefined}
      transition={spring && !reduceMotion ? SPRING : { duration: 0.15, ease: "easeOut" }}
      onKeyDown={onKeyDown}
      // The picker belongs to its field, not to whatever the field sits in: a click on it must not reach a clickable card or modal around it.
      onClick={(e) => e.stopPropagation()}
      style={{ ...menuPosition(anchor, placement), transformOrigin: `${placement.flipUp ? "bottom" : "top"} ${align === "end" ? "right" : "left"}` }}
      className={`${POPOVER_CLASS} ${SCROLLBAR_CLASS} overflow-y-auto overscroll-contain p-3`}
    >
      {children}
    </motion.div>,
    document.body,
  );
};

interface Props {
  /** Accessible name of the popup ("Choose a date"). */
  popoverLabel: string;
  /** The field's text (the formatted date or time), or "" when nothing is chosen. */
  text: string;
  placeholder: string;
  icon: ReactNode;
  /** The field's own look (the classes the page used for the input); a left padding is added to clear the icon. */
  className: string;
  wrapperClassName: string;
  compact: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  invalid?: boolean;
  describedBy?: string;
  /** Spring open / fade out the popup instead of the plain fade-in. */
  spring?: boolean;
  /** Line the popup's right edge up with the field's (default: left edges), and keep this many pixels from the screen edges (default 8). */
  align?: PlaceOptions["align"];
  edge?: number;
  /** The picker itself. Call `close` to close it. */
  children: (close: () => void) => ReactNode;
}

/**
 * A button that looks like the text field it replaces and opens a picker on click: the shared shell of the date and
 * time pickers. Pressing outside, Escape, or choosing closes it; the picker is a true portal on <body>, so a modal's
 * overflow can never clip it.
 */
export function PickerField({ popoverLabel, text, placeholder, icon, className, wrapperClassName, compact, disabled = false, id, ariaLabel, invalid, describedBy, spring = false, align, edge, children }: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const closeAndRefocus = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);

  return (
    <div ref={root} className={wrapperClassName}>
      {icon}
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ? `${ariaLabel}: ${text || "not set"}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else {
            setAnchor(measureAnchor(button.current));
            setOpen(true);
          }
        }}
        // pl-11 (pl-8 compact) clears the icon, as it did on the input this replaces.
        className={`${className} ${compact ? "pl-8" : "pl-11"} block truncate text-left`}
      >
        {text !== "" ? text : <span className="text-gray-400">{placeholder}</span>}
      </button>
      <AnimatePresence>
        {open && anchor && (
          <Popover anchor={anchor} label={popoverLabel} buttonRef={button} rootRef={root} onAnchor={setAnchor} onClose={close} onEscape={closeAndRefocus} spring={spring} align={align} edge={edge}>
            {children(closeAndRefocus)}
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}
