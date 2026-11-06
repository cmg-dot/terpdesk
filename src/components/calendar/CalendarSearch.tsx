"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { CalendarSearchResult } from "@/components/calendar/CalendarSearchResult";
import { MIN_QUERY_LENGTH, searchJobs } from "@/lib/calendarSearch";
import type { SearchEntry } from "@/lib/calendarSearch";

interface Props {
  entries: readonly SearchEntry[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (entry: SearchEntry) => void;
  onClear: () => void;
  nowMs: number;
}

/** True while the person is typing somewhere, so a bare "/" is a character and not the shortcut. */
const isTyping = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null;

/**
 * The calendar's search box: type an SRN, organization, venue or interpreter (two letters or more) and pick a match to
 * jump to its day. "/" or Cmd / Ctrl + K focuses it; Up / Down / Enter / Escape work the list; the X clears it.
 */
export const CalendarSearch = ({ entries, value, onChange, onSelect, onClear, nowMs }: Props) => {
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(value);
  const results = useMemo(() => searchJobs(entries, deferred, nowMs), [entries, deferred, nowMs]);
  const searching = value.trim().length >= MIN_QUERY_LENGTH;
  const showList = open && searching;

  useEffect(() => setActive(0), [deferred]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const mod = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target);
      if (!mod && !slash) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pick = (entry: SearchEntry) => {
    setOpen(false);
    onSelect(entry);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (results.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    } else if (event.key === "Enter" && showList && results[active]) {
      event.preventDefault();
      pick(results[active]);
    } else if (event.key === "Escape") {
      if (showList) {
        event.preventDefault();
        setOpen(false);
      } else if (value !== "") {
        onClear();
      }
    }
  };

  return (
    <div className="relative w-full sm:max-w-md" onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setOpen(false)}>
      <label htmlFor={`${listId}-input`} className="sr-only">Search the calendar</label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
      <input
        ref={input}
        id={`${listId}-input`}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
        placeholder="Search SRN, organization, or venue... (Press / or ⌘K)"
        className="w-full truncate rounded-full border-none bg-[#F4F3EF] py-2.5 pl-10 pr-10 text-sm text-gray-800 outline-none transition-shadow placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-[#0B3B32]"
      />
      {value !== "" && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onClear();
            input.current?.focus();
          }}
          className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3B32]"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {showList && (
        <ul id={listId} role="listbox" aria-label="Matching jobs" className="absolute left-0 right-0 z-30 mt-2 max-h-[22rem] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl sm:min-w-[26rem]">
          {results.length === 0 ? (
            <li role="presentation" className="px-3 py-3 text-sm text-[var(--sage)]">No jobs match &ldquo;{value.trim()}&rdquo;.</li>
          ) : (
            results.map((entry, i) => (
              <CalendarSearchResult key={entry.id} id={`${listId}-${i}`} entry={entry} active={i === active} onPick={pick} onHover={() => setActive(i)} />
            ))
          )}
        </ul>
      )}
    </div>
  );
};
