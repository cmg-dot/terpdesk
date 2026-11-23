"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** True while the person is typing somewhere (a field, a select or an editable area), where "/" must stay a plain character. */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  const element = target as Partial<HTMLElement> | null;
  if (!element || typeof element.tagName !== "string") return false;
  return TYPING_TAGS.has(element.tagName) || element.isContentEditable === true;
};

/** Pressing "/" anywhere on the page (outside a field) moves the cursor to the search box, as in most work queues. */
export function useSlashToFocus(input: RefObject<HTMLInputElement>): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || isTypingTarget(event.target)) return;
      const field = input.current;
      if (!field) return;
      event.preventDefault();
      field.focus();
      field.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [input]);
}
