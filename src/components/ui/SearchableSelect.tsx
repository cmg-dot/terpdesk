"use client";

import { useId, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Search, X } from "lucide-react";

export interface SearchableOption {
  id: string;
  label: string;
  /** Second line, searched too (for example an email address). */
  description?: string;
  /** Shown at the end of the row (for example a status badge). Not searched. */
  trailing?: ReactNode;
}

interface SearchableSelectProps {
  label: string;
  options: SearchableOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

const matches = (option: SearchableOption, query: string): boolean => {
  const haystack = `${option.label} ${option.description ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
};

/** A type-to-filter dropdown (ARIA combobox): arrow keys move, Enter picks, Escape closes. */
export const SearchableSelect = ({ label, options, value, onChange, placeholder = "Search…", emptyText = "No matches.", disabled }: SearchableSelectProps) => {
  const uid = useId();
  const listId = `${uid}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = options.find((o) => o.id === value);
  const visible = useMemo(() => options.filter((o) => matches(o, query)), [options, query]);
  const activeIndex = Math.min(active, Math.max(visible.length - 1, 0));

  const pick = (option: SearchableOption) => {
    onChange(option.id);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + visible.length) % Math.max(visible.length, 1));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (visible[activeIndex]) pick(visible[activeIndex]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <label htmlFor={`${uid}-input`} className="mb-2 block text-sm text-[var(--sage)]">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          id={`${uid}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && visible[activeIndex] ? `${uid}-opt-${visible[activeIndex].id}` : undefined}
          autoComplete="off"
          disabled={disabled}
          value={open ? query : (selected?.label ?? "")}
          placeholder={open && selected ? selected.label : placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={onKeyDown}
          className="w-full rounded-full border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-800 outline-none transition-shadow focus:ring-2 focus:ring-[#0B3B32] disabled:opacity-60"
        />
        {selected && !disabled && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => { onChange(""); setQuery(""); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-gray-200 bg-white p-1 shadow-lg">
          {visible.length === 0 ? (
            <li role="presentation" className="px-4 py-3 text-sm text-gray-500">{emptyText}</li>
          ) : (
            visible.map((option, i) => (
              <li
                key={option.id}
                id={`${uid}-opt-${option.id}`}
                role="option"
                aria-selected={option.id === value}
                // mousedown (not click) so the input does not lose focus and close the list first
                onMouseDown={(e) => { e.preventDefault(); pick(option); }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${i === activeIndex ? "bg-[#F5F4F0]" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[var(--ink)]">{option.label}</span>
                  {option.description && <span className="block truncate text-xs text-gray-500">{option.description}</span>}
                </span>
                {option.trailing && <span className="shrink-0">{option.trailing}</span>}
              </li>
            ))
          )}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">{open ? `${visible.length} ${visible.length === 1 ? "match" : "matches"}` : ""}</p>
    </div>
  );
};
