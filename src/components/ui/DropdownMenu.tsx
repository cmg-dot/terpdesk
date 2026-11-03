"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { MENU_MAX_HEIGHT, menuPosition, NEUTRAL_PLACEMENT, placePanel } from "@/lib/dropdown";
import type { Anchor, DropdownOption, Placement } from "@/lib/dropdown";

// useLayoutEffect warns when a page is rendered on the server; the menu only ever opens in the browser, so fall back to useEffect there.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Where the button is on screen right now (viewport pixels), or null when it isn't mounted. */
export const measureAnchor = (button: HTMLElement | null): Anchor | null => {
  const box = button?.getBoundingClientRect();
  return box ? { left: box.left, top: box.top, bottom: box.bottom, width: box.width, viewportHeight: window.innerHeight } : null;
};

interface RowProps {
  id: string;
  index: number;
  option: DropdownOption;
  showGroup: boolean;
  isActive: boolean;
  isSelected: boolean;
  rowText: string;
  onPick: (option: DropdownOption) => void;
  onHover: (index: number) => void;
}

/** One choice. Memoised: moving the highlight re-renders only the row it leaves and the row it lands on, not the whole list. */
const Row = memo(function Row({ id, index, option, showGroup, isActive, isSelected, rowText, onPick, onHover }: RowProps) {
  return (
    <li role="presentation">
      {showGroup && <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-800/70">{option.group}</div>}
      <div
        id={`${id}-opt-${index}`}
        role="option"
        aria-selected={isSelected}
        data-active={isActive}
        title={option.label}
        onClick={() => onPick(option)}
        onMouseEnter={() => onHover(index)}
        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 leading-5 tracking-tight ${rowText} ${isActive ? "bg-emerald-50 text-[#0B3B32] shadow-[inset_3px_0_0_#0B3B32]" : "text-slate-800"} ${isSelected ? "font-medium" : ""}`}
      >
        <Check className={`h-3.5 w-3.5 flex-none text-[#0B3B32] ${isSelected ? "" : "invisible"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        {option.count !== undefined && <span className="flex-none text-[12px] tabular-nums text-slate-500">{option.count}</span>}
      </div>
    </li>
  );
});

interface Props {
  /** True while the menu should be showing; false while it fades out (the menu then reports `onGone`). */
  open: boolean;
  id: string;
  ariaLabel: string | undefined;
  options: readonly DropdownOption[];
  selectedIndex: number;
  active: number;
  rowText: string;
  anchor: Anchor;
  /** True when the highlight was last moved by the keyboard (only then is it scrolled into view; hovering must not scroll). */
  keyboardNav: MutableRefObject<boolean>;
  rootRef: RefObject<HTMLElement>;
  buttonRef: RefObject<HTMLElement>;
  onAnchor: (anchor: Anchor) => void;
  onClose: () => void;
  onPick: (option: DropdownOption) => void;
  onHover: (index: number) => void;
  onGone: () => void;
}

/**
 * The open menu of a Dropdown: drawn in a portal at the end of the page with fixed positioning (so no modal, scrolling card
 * or overflow-hidden parent can clip it), cream with a border and a deep shadow so it stands off the page, max-h-64 and
 * scrolling inside itself with the emerald scrollbar (.menu-scroll). It exists only while open or fading out, so a page full
 * of dropdowns pays nothing for the closed ones.
 */
export const DropdownMenu = ({ open, id, ariaLabel, options, selectedIndex, active, rowText, anchor, keyboardNav, rootRef, buttonRef, onAnchor, onClose, onPick, onHover, onGone }: Props) => {
  const reduceMotion = useReducedMotion();
  const [placement, setPlacement] = useState<Placement>(NEUTRAL_PLACEMENT);
  const panel = useRef<HTMLUListElement>(null);

  // Once the menu is drawn, fit its natural size to the room on screen (before the browser paints).
  useBrowserLayoutEffect(() => {
    if (!open || !panel.current) return;
    const width = panel.current.getBoundingClientRect().width;
    // scrollHeight is the full list height even while the menu is capped, so capping it cannot flip the answer back.
    const height = Math.min(panel.current.scrollHeight + 2, MENU_MAX_HEIGHT);
    const next = placePanel(anchor, { width, height }, { width: window.innerWidth, height: window.innerHeight });
    setPlacement((now) => (now.flipUp === next.flipUp && now.dx === next.dx && now.maxHeight === next.maxHeight ? now : next));
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || panel.current?.contains(target)) return;
      onClose();
    };
    // The menu is fixed to the screen: follow the button when the page or any scrolling parent moves (at most once a frame),
    // and close if the button leaves the view.
    let frame = 0;
    const follow = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const next = measureAnchor(buttonRef.current);
        if (!next) return;
        if (next.bottom < 0 || next.top > next.viewportHeight) onClose();
        else onAnchor(next);
      });
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away, { passive: true });
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
    };
  }, [open, rootRef, buttonRef, onAnchor, onClose]);

  // Keep the highlighted choice inside the scrolling menu, but only when the keyboard moved it.
  useEffect(() => {
    if (open && keyboardNav.current) panel.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, keyboardNav]);

  // Drift in from the edge the menu hangs from (down from the button, or up from it when it opens upward).
  const drift = reduceMotion ? 0 : placement.flipUp ? 5 : -5;

  return createPortal(
    <AnimatePresence onExitComplete={onGone}>
      {open && (
        <motion.ul
          ref={panel}
          id={`${id}-list`}
          role="listbox"
          aria-label={ariaLabel}
          initial={{ opacity: 0, y: drift }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: drift }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          // Keep focus on the button while the menu is clicked or scrolled, so the menu does not close before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          // The menu belongs to the dropdown, not to whatever it sits in: a click on it must not reach a clickable card or modal around the button.
          onClick={(e) => e.stopPropagation()}
          style={menuPosition(anchor, placement)}
          className="menu-scroll fixed z-[110] max-h-64 w-max max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-[#FBFAF6] p-1 shadow-xl ring-1 ring-black/5"
        >
          {options.map((option, index) => (
            <Row
              key={option.value}
              id={id}
              index={index}
              option={option}
              showGroup={Boolean(option.group) && option.group !== options[index - 1]?.group}
              isActive={index === active}
              isSelected={index === selectedIndex}
              rowText={rowText}
              onPick={onPick}
              onHover={onHover}
            />
          ))}
        </motion.ul>
      )}
    </AnimatePresence>,
    document.body,
  );
};
