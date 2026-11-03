"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { MENU_MAX_HEIGHT, NEUTRAL_PLACEMENT, placePanel } from "@/lib/dropdown";
import type { Anchor, Placement } from "@/lib/dropdown";

// useLayoutEffect warns when a page is rendered on the server; panels only ever open in the browser, so fall back to useEffect there.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Where the button is on screen right now (viewport pixels), or null when it isn't mounted. */
export const measureAnchor = (button: HTMLElement | null): Anchor | null => {
  const box = button?.getBoundingClientRect();
  return box ? { left: box.left, top: box.top, bottom: box.bottom, width: box.width, viewportHeight: window.innerHeight } : null;
};

interface Options {
  anchor: Anchor;
  /** The button the panel hangs from (followed when the page scrolls). */
  buttonRef: RefObject<HTMLElement>;
  /** The button's wrapper: a press inside it is not an "outside" press. */
  rootRef: RefObject<HTMLElement>;
  onAnchor: (anchor: Anchor) => void;
  onClose: () => void;
  /** The tallest the panel gets before it scrolls inside itself. */
  maxHeight?: number;
}

/**
 * The positioning shared by every floating panel (dropdown menu, date picker, time picker) while it is open:
 *  - fits the panel to the room on screen (opens upward, slides sideways, shortens) before the browser paints;
 *  - closes it on a press outside the button and the panel;
 *  - follows the button when the page or any scrolling parent moves (at most once a frame, passively), and closes it
 *    if the button leaves the view.
 * Returns the ref to put on the panel and the placement to apply to it.
 */
export function useAnchoredPanel<T extends HTMLElement>({ anchor, buttonRef, rootRef, onAnchor, onClose, maxHeight = MENU_MAX_HEIGHT }: Options): { panel: RefObject<T>; placement: Placement } {
  const panel = useRef<T>(null);
  const [placement, setPlacement] = useState<Placement>(NEUTRAL_PLACEMENT);

  useBrowserLayoutEffect(() => {
    if (!panel.current) return;
    const width = panel.current.getBoundingClientRect().width;
    // scrollHeight is the full content height even while the panel is capped, so capping it cannot flip the answer back.
    const height = Math.min(panel.current.scrollHeight + 2, maxHeight);
    const next = placePanel(anchor, { width, height }, { width: window.innerWidth, height: window.innerHeight });
    setPlacement((now) => (now.flipUp === next.flipUp && now.dx === next.dx && now.maxHeight === next.maxHeight ? now : next));
  }, [anchor, maxHeight]);

  useEffect(() => {
    const away = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || panel.current?.contains(target)) return;
      onClose();
    };
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
  }, [rootRef, buttonRef, onAnchor, onClose]);

  return { panel, placement };
}
