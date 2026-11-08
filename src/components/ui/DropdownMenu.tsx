"use client";

import { memo, useLayoutEffect, useEffect, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { POPOVER_CLASS, SCROLLBAR_CLASS } from "@/components/ui/popoverStyles";
import { useAnchoredPanel } from "@/hooks/useAnchoredPanel";
import { MENU_MAX_HEIGHT, menuPosition } from "@/lib/dropdown";
import type { Anchor, DropdownOption } from "@/lib/dropdown";

/** Fixed row height (px): what lets a long list draw only the rows that are on screen. */
const ROW_HEIGHT = 32;
/** The menu's inner padding (px). */
const PAD = 4;
/** Lists longer than this are drawn windowed (only the visible rows exist in the page). */
export const VIRTUAL_FROM = 100;
const OVERSCAN = 6;

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface RowProps {
  id: string;
  index: number;
  size: number;
  option: DropdownOption;
  showGroup: boolean;
  isActive: boolean;
  isSelected: boolean;
  rowText: string;
  onPick: (option: DropdownOption) => void;
  onHover: (index: number) => void;
}

/** One choice. Memoised: moving the highlight re-renders only the row it leaves and the row it lands on, not the list. */
const Row = memo(function Row({ id, index, size, option, showGroup, isActive, isSelected, rowText, onPick, onHover }: RowProps) {
  return (
    <li role="presentation">
      {showGroup && <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-800/70">{option.group}</div>}
      <div
        id={`${id}-opt-${index}`}
        role="option"
        aria-selected={isSelected}
        aria-setsize={size}
        aria-posinset={index + 1}
        data-active={isActive}
        title={option.label}
        onClick={() => onPick(option)}
        onMouseEnter={() => onHover(index)}
        className={`flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2.5 leading-5 tracking-tight ${rowText} ${isActive ? "bg-emerald-50 text-[var(--forest)] shadow-[inset_3px_0_0_#0B3B32]" : "text-slate-800"} ${isSelected ? "font-medium" : ""}`}
      >
        <Check className={`h-3.5 w-3.5 flex-none text-[var(--forest)] ${isSelected ? "" : "invisible"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        {option.count !== undefined && <span className="flex-none text-[12px] tabular-nums text-slate-500">{option.count}</span>}
      </div>
    </li>
  );
});

interface Props {
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
}

/**
 * The open menu of a Dropdown. It is a true portal: `createPortal(..., document.body)`, so it is not a descendant of
 * the modal, card or overflow-hidden parent the button sits in and nothing there can clip it; it is fixed to the screen
 * at the top of the stack (z-[9999]). It exists only while open (closing removes it at once), and a long list is drawn
 * windowed: only the rows on screen (plus a few) are in the page, so a 300-item list opens as fast as a 10-item one.
 */
export const DropdownMenu = ({ id, ariaLabel, options, selectedIndex, active, rowText, anchor, keyboardNav, rootRef, buttonRef, onAnchor, onClose, onPick, onHover }: Props) => {
  const reduceMotion = useReducedMotion();
  const { panel, placement } = useAnchoredPanel<HTMLUListElement>({ anchor, buttonRef, rootRef, onAnchor, onClose });

  const virtual = options.length > VIRTUAL_FROM && !options.some((option) => option.group);
  const viewHeight = placement.maxHeight ?? MENU_MAX_HEIGHT;
  // The scroll position, rounded down to a whole row, so scrolling re-renders only when a row boundary is crossed.
  const [scrollTop, setScrollTop] = useState(() => (virtual ? Math.max(0, active * ROW_HEIGHT - viewHeight / 2) : 0));
  const first = virtual ? Math.max(0, Math.floor((scrollTop - PAD) / ROW_HEIGHT) - OVERSCAN) : 0;
  const last = virtual ? Math.min(options.length - 1, Math.ceil((scrollTop + viewHeight - PAD) / ROW_HEIGHT) + OVERSCAN) : options.length - 1;

  // Keep the highlighted choice in view, but only when the keyboard moved it (hovering must never scroll the list).
  useBrowserLayoutEffect(() => {
    const el = panel.current;
    if (!el || !keyboardNav.current) return;
    if (!virtual) {
      el.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    const view = el.clientHeight || viewHeight;
    const top = PAD + active * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = Math.max(0, top - PAD);
    else if (top + ROW_HEIGHT > el.scrollTop + view) el.scrollTop = top + ROW_HEIGHT - view + PAD;
    setScrollTop(Math.floor(el.scrollTop / ROW_HEIGHT) * ROW_HEIGHT);
  }, [active, virtual, keyboardNav, panel, viewHeight]);

  // Drift in from the edge the menu hangs from (down from the button, or up from it when it opens upward).
  const drift = reduceMotion ? 0 : placement.flipUp ? 5 : -5;
  const rows = [];
  for (let index = first; index <= last; index += 1) {
    const option = options[index];
    rows.push(
      <Row
        key={option.value}
        id={id}
        index={index}
        size={options.length}
        option={option}
        showGroup={Boolean(option.group) && option.group !== options[index - 1]?.group}
        isActive={index === active}
        isSelected={index === selectedIndex}
        rowText={rowText}
        onPick={onPick}
        onHover={onHover}
      />,
    );
  }

  return createPortal(
    <motion.ul
      ref={panel}
      id={`${id}-list`}
      role="listbox"
      aria-label={ariaLabel}
      initial={{ opacity: 0, y: drift }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      // Keep focus on the button while the menu is clicked or scrolled, so the menu does not close before the click lands.
      onMouseDown={(e) => e.preventDefault()}
      // The menu belongs to the dropdown, not to whatever it sits in: a click on it must not reach a clickable card or modal around the button.
      onClick={(e) => e.stopPropagation()}
      onScroll={virtual ? (e) => setScrollTop(Math.floor(e.currentTarget.scrollTop / ROW_HEIGHT) * ROW_HEIGHT) : undefined}
      style={menuPosition(anchor, placement)}
      className={`${POPOVER_CLASS} ${SCROLLBAR_CLASS} max-h-64 w-max max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain p-1`}
    >
      {virtual && first > 0 && <li role="presentation" aria-hidden="true" style={{ height: first * ROW_HEIGHT }} />}
      {rows}
      {virtual && last < options.length - 1 && <li role="presentation" aria-hidden="true" style={{ height: (options.length - 1 - last) * ROW_HEIGHT }} />}
    </motion.ul>,
    document.body,
  );
};
