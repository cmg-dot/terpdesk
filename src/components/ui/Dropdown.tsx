"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { MENU_MAX_HEIGHT, menuPosition, NEUTRAL_PLACEMENT, placePanel } from "@/lib/dropdown";
import type { Anchor, DropdownOption, Placement } from "@/lib/dropdown";

// useLayoutEffect warns when a page is rendered on the server; the menu only ever opens in the browser, so fall back to useEffect there.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type DropdownVariant = "pill" | "field" | "compact";

interface Props {
  id: string;
  options: readonly DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  /**
   * A visible label drawn by the dropdown. Leave it out when the page draws its own `<label htmlFor={id}>`, or give
   * `ariaLabel` when there is no visible label at all.
   */
  label?: string;
  /** With `label`: "inline" puts it beside the button, "stacked" above. */
  layout?: "inline" | "stacked";
  ariaLabel?: string;
  /** pill: filter bars; field: form inputs; compact: small inline rows. */
  variant?: DropdownVariant;
  disabled?: boolean;
  invalid?: boolean;
  /** The id of the text that describes this field (a hint or error). */
  describedBy?: string;
  /** Shown on the button when `value` matches no choice. */
  placeholder?: string;
  /** Sizing for the button's wrapper (the menu is as wide as its longest choice, up to 20rem, but never off screen). */
  className?: string;
}

const TRIGGER_SHAPE: Record<DropdownVariant, string> = {
  pill: "rounded-full py-2 pl-3.5 pr-3 text-[13px] font-medium",
  field: "rounded-xl py-2.5 pl-3.5 pr-3 text-sm",
  compact: "rounded-lg py-1.5 pl-3 pr-2.5 text-xs",
};

/**
 * The app's select: use it instead of a native `<select>`. A cream button and menu with dark slate text, soft emerald
 * (emerald-50) hover and the primary emerald #0B3B32 for the check mark and chevron.
 *
 * The menu is drawn in a portal at the end of the page with fixed positioning, so a modal, a scrolling card or an
 * `overflow-hidden` parent can never clip it. It is at most max-h-64 tall and scrolls inside itself (slim emerald-tinted
 * scrollbar, `.menu-scroll`), opens upward when there is no room below, slides sideways to stay on screen, and follows
 * the button if the page scrolls. It fades and drifts in and out in 0.15s (not at all for people who ask their device to
 * reduce motion). It is an ARIA select-only combobox. Keyboard: arrows, Home/End, Enter or Space to pick, Escape to
 * close, typing a letter jumps to the next choice starting with it.
 */
export const Dropdown = ({
  id,
  options,
  value,
  onChange,
  label,
  layout = "inline",
  ariaLabel,
  variant = "field",
  disabled = false,
  invalid = false,
  describedBy,
  placeholder = "",
  className = "",
}: Props) => {
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [placement, setPlacement] = useState<Placement>(NEUTRAL_PLACEMENT);
  // Where the menu is drawn: the end of the page. Known only in the browser, so pages render the same on the server.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setPortalTarget(document.body), []);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLUListElement>(null);
  const reduceMotion = useReducedMotion();
  // While the menu fades out it is still on screen but frozen as last drawn, so its clicks must check the live state.
  const isOpen = useRef(open);
  isOpen.current = open;

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  const last = options.length - 1;

  const measure = (): Anchor | null => {
    const box = button.current?.getBoundingClientRect();
    return box ? { left: box.left, top: box.top, bottom: box.bottom, width: box.width, viewportHeight: window.innerHeight } : null;
  };
  const openMenu = () => {
    if (disabled) return;
    setPlacement(NEUTRAL_PLACEMENT);
    setActive(Math.max(selectedIndex, 0));
    setAnchor(measure());
    setOpen(true);
  };
  const pick = (option: DropdownOption | undefined) => {
    if (!isOpen.current) return;
    setOpen(false);
    if (option) onChange(option.value);
  };

  // Once the menu is drawn, fit its natural size to the room on screen (before the browser paints).
  useBrowserLayoutEffect(() => {
    if (!open || !anchor || !panel.current) return;
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
      if (root.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
    };
    // The menu is fixed to the screen: follow the button when the page or any scrolling parent moves, close if it leaves view.
    const follow = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      const next = measure();
      if (!next) return;
      if (next.bottom < 0 || next.top > next.viewportHeight) setOpen(false);
      else setAnchor(next);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  // Keep the highlighted choice inside the scrolling menu.
  useEffect(() => {
    if (open) panel.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const move = (to: number) => {
      event.preventDefault();
      if (!open) return openMenu();
      setActive(Math.min(Math.max(to, 0), last));
    };
    if (event.key === "ArrowDown") move(active + 1);
    else if (event.key === "ArrowUp") move(active - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(last);
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) pick(options[active]);
      else openMenu();
    } else if (event.key === "Escape" && open) {
      // Keep a surrounding dialog from also treating this Escape as "close me".
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Tab") setOpen(false);
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Type-ahead: the next choice (after the highlighted one, wrapping round) whose label starts with the letter.
      const letter = event.key.toLowerCase();
      const from = open ? active : selectedIndex;
      for (let step = 1; step <= options.length; step += 1) {
        const index = (from + step) % options.length;
        if (options[index].label.toLowerCase().startsWith(letter)) {
          if (!open) openMenu();
          setActive(index);
          break;
        }
      }
    }
  };

  const labelClass = layout === "stacked" ? "block text-[12px] font-medium text-gray-600" : "flex-none text-sm text-gray-700";
  // Drift in from the edge the menu hangs from (down from the button, or up from it when it opens upward).
  const drift = reduceMotion ? 0 : placement.flipUp ? 5 : -5;
  const rowText = variant === "compact" ? "text-xs" : "text-[13px]";

  return (
    <div className={label ? (layout === "stacked" ? "space-y-1" : "flex items-center gap-2") : "contents"}>
      {label && <label id={`${id}-label`} htmlFor={id} className={labelClass}>{label}</label>}
      <div ref={root} className={`relative min-w-0 ${className}`} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
        <button
          ref={button}
          id={id}
          type="button"
          role="combobox"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={label ? undefined : ariaLabel}
          aria-labelledby={label ? `${id}-label ${id}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKeyDown}
          // Space activates a button on key-up in some browsers: stop it re-opening the menu we just closed.
          onKeyUp={(e) => { if (e.key === " ") e.preventDefault(); }}
          className={`flex w-full min-w-0 items-center justify-between gap-2 border border-stone-200 bg-[#F4F3EF] text-left leading-5 tracking-tight text-slate-800 outline-none transition-colors hover:bg-emerald-50 aria-expanded:bg-emerald-50 focus-visible:border-[#0B3B32] focus-visible:ring-2 focus-visible:ring-[#0B3B32]/40 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-400 ${TRIGGER_SHAPE[variant]}`}
        >
          <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown className={`h-4 w-4 flex-none text-[#0B3B32] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {portalTarget && createPortal(
          <AnimatePresence>
            {open && anchor && (
              <motion.ul
                ref={panel}
                id={listId}
                role="listbox"
                aria-label={ariaLabel ?? label}
                initial={{ opacity: 0, y: drift }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: drift }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                // Keep focus on the button while the menu is clicked or scrolled, so the menu does not close before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                style={menuPosition(anchor, placement)}
                className="menu-scroll fixed z-[110] max-h-64 w-max max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-xl border border-stone-200 bg-[#FBFAF6] p-1 shadow-lg shadow-black/10"
              >
                {options.map((option, index) => (
                  <li key={option.value} role="presentation">
                    {option.group && option.group !== options[index - 1]?.group && (
                      <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-800/70">{option.group}</div>
                    )}
                    <div
                      id={`${id}-opt-${index}`}
                      role="option"
                      aria-selected={index === selectedIndex}
                      data-active={index === active}
                      title={option.label}
                      onClick={() => pick(option)}
                      onMouseEnter={() => setActive(index)}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 leading-5 tracking-tight text-slate-800 ${rowText} ${index === active ? "bg-emerald-50 text-slate-900" : ""} ${index === selectedIndex ? "font-medium" : ""}`}
                    >
                      <Check className={`h-3.5 w-3.5 flex-none text-[#0B3B32] ${index === selectedIndex ? "" : "invisible"}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.count !== undefined && <span className="flex-none text-[12px] tabular-nums text-slate-500">{option.count}</span>}
                    </div>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>,
          portalTarget,
        )}
      </div>
    </div>
  );
};
