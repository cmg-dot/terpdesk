"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { NEUTRAL_PLACEMENT, placePanel } from "@/lib/filterDropdown";
import type { DropdownOption, Placement } from "@/lib/filterDropdown";

interface Props {
  id: string;
  label: string;
  options: readonly DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  /** "inline" puts the label beside the button, "stacked" puts it above. */
  layout?: "inline" | "stacked";
  /** Sizing for the button's wrapper (the menu is as wide as its longest choice, up to 20rem, but never off screen). */
  className?: string;
}

/**
 * A select-style dropdown (ARIA select-only combobox) for filters, in the agency's emerald green (the sidebar's #0B3B32,
 * with the buttons' darker #082a23 on hover) and tight type. The menu is at most max-h-64 tall and scrolls inside itself
 * with a slim emerald scrollbar (.menu-scroll), opens upward when there is no room below, and slides sideways to stay on
 * screen, so a long list never runs off the page. It fades and drifts in and out in 0.15s (not at all for people who ask
 * their device to reduce motion). Keyboard: arrows, Home/End, Enter or Space to pick, Escape to close, typing a letter
 * jumps to the next choice starting with it.
 */
export const FilterDropdown = ({ id, label, options, value, onChange, layout = "inline", className = "" }: Props) => {
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<Placement>(NEUTRAL_PLACEMENT);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLUListElement>(null);
  const reduceMotion = useReducedMotion();
  // While the menu fades out it is still on screen but frozen as last drawn, so its clicks must check the live state.
  const isOpen = useRef(open);
  isOpen.current = open;

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];
  const last = options.length - 1;

  const openMenu = () => {
    setPlacement(NEUTRAL_PLACEMENT);
    setActive(selectedIndex);
    setOpen(true);
  };
  const pick = (option: DropdownOption | undefined) => {
    if (!isOpen.current) return;
    setOpen(false);
    if (option) onChange(option.value);
  };

  // Once the menu is drawn, measure it against the screen and move it if it would overflow (before the browser paints).
  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return;
    const trigger = button.current.getBoundingClientRect();
    const box = panel.current.getBoundingClientRect();
    setPlacement(placePanel(trigger, { width: box.width, height: box.height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
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
  const placed = placement.flipUp ? "bottom-full mb-1.5" : "top-full mt-1.5";
  // Drift in from the edge the menu hangs from (down from the button, or up from it when it opens upward).
  const drift = reduceMotion ? 0 : placement.flipUp ? 5 : -5;

  return (
    <div className={layout === "stacked" ? "space-y-1" : "flex items-center gap-2"}>
      <label id={`${id}-label`} htmlFor={id} className={labelClass}>{label}</label>
      <div ref={root} className={`relative min-w-0 ${className}`} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
        <button
          ref={button}
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${id}-label ${id}`}
          aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKeyDown}
          // Space activates a button on key-up in some browsers: stop it re-opening the menu we just closed.
          onKeyUp={(e) => { if (e.key === " ") e.preventDefault(); }}
          className="flex w-full items-center justify-between gap-2 rounded-full bg-[#0B3B32] py-2 pl-3.5 pr-3 text-left text-[13px] font-medium leading-5 tracking-tight text-white outline-none transition-colors hover:bg-[#082a23] focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-1"
        >
          <span className="min-w-0 truncate">{selected?.label ?? ""}</span>
          <ChevronDown className={`h-4 w-4 flex-none text-emerald-200 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={panel}
              id={listId}
              role="listbox"
              aria-labelledby={`${id}-label`}
              initial={{ opacity: 0, y: drift }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: drift }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              // Keep focus on the button while the menu is clicked or scrolled, so the menu does not close before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              // x is the slide that keeps the menu on screen; framer-motion owns the transform, so it goes through here.
              style={{ x: placement.dx, maxHeight: placement.maxHeight ?? undefined }}
              className={`menu-scroll absolute left-0 z-30 max-h-64 w-max min-w-full max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-xl border border-[#1B433C] bg-[#0B3B32] p-1 shadow-xl shadow-black/20 ${placed}`}
            >
              {options.map((option, index) => (
                <li key={option.value} role="presentation">
                  {option.group && option.group !== options[index - 1]?.group && (
                    <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-300/80">{option.group}</div>
                  )}
                  <div
                    id={`${id}-opt-${index}`}
                    role="option"
                    aria-selected={index === selectedIndex}
                    data-active={index === active}
                    title={option.label}
                    onClick={() => pick(option)}
                    onMouseEnter={() => setActive(index)}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] leading-5 tracking-tight ${index === active ? "bg-[#1B433C] text-white" : "text-emerald-50"}`}
                  >
                    <Check className={`h-3.5 w-3.5 flex-none text-emerald-300 ${index === selectedIndex ? "" : "invisible"}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.count !== undefined && <span className="flex-none text-[12px] tabular-nums text-emerald-200/75">{option.count}</span>}
                  </div>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
