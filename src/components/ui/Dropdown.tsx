"use client";

import { memo, useCallback, useRef, useState, useTransition } from "react";
import type { KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { measureAnchor } from "@/hooks/useAnchoredPanel";
import type { Anchor, DropdownOption } from "@/lib/dropdown";

export type DropdownVariant = "pill" | "field" | "compact" | "form" | "formLarge";

export interface DropdownProps {
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
  /** pill: filter bars; field: form inputs; compact: small inline rows; form / formLarge: the agency forms' fully rounded inputs. */
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
  // The rounded-full inputs of the agency request and client forms (form), and the taller filter row on the requests list (formLarge).
  form: "rounded-full py-2.5 pl-5 pr-4 text-sm",
  formLarge: "rounded-full py-3.5 pl-6 pr-5 text-[14px]",
};

const ROW_TEXT: Record<DropdownVariant, string> = { pill: "text-[13px]", field: "text-[13px]", compact: "text-xs", form: "text-sm", formLarge: "text-[14px]" };

const sameOptions = (a: readonly DropdownOption[], b: readonly DropdownOption[]): boolean =>
  a === b || (a.length === b.length && a.every((o, i) => o.value === b[i].value && o.label === b[i].label && o.count === b[i].count && o.group === b[i].group));

/** Re-render only when something the dropdown shows has changed: a parent's own re-renders (keystrokes elsewhere in a form) are free. */
const sameProps = (a: DropdownProps, b: DropdownProps): boolean =>
  a.id === b.id && a.value === b.value && a.onChange === b.onChange && a.label === b.label && a.layout === b.layout && a.ariaLabel === b.ariaLabel &&
  a.variant === b.variant && a.disabled === b.disabled && a.invalid === b.invalid && a.describedBy === b.describedBy &&
  a.placeholder === b.placeholder && a.className === b.className && sameOptions(a.options, b.options);

const DropdownField = memo(function DropdownField({
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
}: DropdownProps) {
  // `open` and the highlight live here, so opening, closing and hovering re-render this dropdown only, never the form around it.
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const keyboardNav = useRef(true);
  // A pick tells the parent in a transition: the menu closes and the button shows the choice at once, and a heavy form
  // re-renders afterwards (and can be interrupted) instead of freezing the click. If the parent refuses the change, the
  // button goes back to the value it passed.
  const [picking, startPicking] = useTransition();
  const [picked, setPicked] = useState<string | null>(null);
  const shown = picking && picked !== null ? picked : value;

  const selectedIndex = options.findIndex((option) => option.value === shown);
  const selected = options[selectedIndex];
  const last = options.length - 1;

  const openMenu = () => {
    if (disabled) return;
    keyboardNav.current = true;
    setActive(Math.max(selectedIndex, 0));
    setAnchor(measureAnchor(button.current));
    setOpen(true);
  };
  const close = useCallback(() => setOpen(false), []);
  const hover = useCallback((index: number) => {
    keyboardNav.current = false;
    setActive(index);
  }, []);
  const pick = useCallback(
    (option: DropdownOption) => {
      setOpen(false);
      setPicked(option.value);
      startPicking(() => onChange(option.value));
    },
    [onChange],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const move = (to: number) => {
      handled();
      if (!open) return openMenu();
      keyboardNav.current = true;
      setActive(Math.min(Math.max(to, 0), last));
    };
    if (event.key === "ArrowDown") move(active + 1);
    else if (event.key === "ArrowUp") move(active - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(last);
    else if (event.key === "Enter" || event.key === " ") {
      handled();
      if (open) {
        if (options[active]) pick(options[active]);
        else setOpen(false);
      } else openMenu();
    } else if (event.key === "Escape" && open) {
      // Keep a surrounding dialog from also treating this Escape as "close me".
      handled();
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
          keyboardNav.current = true;
          setActive(index);
          break;
        }
      }
    }
  };

  const labelClass = layout === "stacked" ? "block text-[12px] font-medium text-gray-600" : "flex-none text-sm text-gray-700";

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
          aria-controls={`${id}-list`}
          aria-label={label ? undefined : ariaLabel}
          aria-labelledby={label ? `${id}-label ${id}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
          onClick={(e) => {
            // The click belongs to the dropdown: it must not also trigger a clickable card or row around it.
            e.stopPropagation();
            if (open) setOpen(false);
            else openMenu();
          }}
          onKeyDown={onKeyDown}
          // Space activates a button on key-up in some browsers: stop it re-opening the menu we just closed.
          onKeyUp={(e) => { if (e.key === " ") e.preventDefault(); }}
          className={`flex w-full min-w-0 items-center justify-between gap-2 border border-stone-200 bg-[#F4F3EF] text-left leading-5 tracking-tight text-slate-800 outline-none transition-colors hover:border-[rgb(var(--forest-rgb)/0.4)] hover:bg-emerald-50 aria-expanded:border-[rgb(var(--forest-rgb)/0.4)] aria-expanded:bg-emerald-50 focus-visible:border-[var(--forest)] focus-visible:ring-2 focus-visible:ring-[rgb(var(--forest-rgb)/0.4)] disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-400 ${TRIGGER_SHAPE[variant]}`}
        >
          <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown className={`h-4 w-4 flex-none text-[var(--forest)] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {open && anchor && (
          <DropdownMenu
            id={id}
            ariaLabel={ariaLabel ?? label}
            options={options}
            selectedIndex={selectedIndex}
            active={active}
            rowText={ROW_TEXT[variant]}
            anchor={anchor}
            keyboardNav={keyboardNav}
            rootRef={root}
            buttonRef={button}
            onAnchor={setAnchor}
            onClose={close}
            onPick={pick}
            onHover={hover}
          />
        )}
      </div>
    </div>
  );
}, sameProps);

/**
 * The app's select: use it instead of a native `<select>`. A cream button and menu with dark slate text, soft emerald
 * (emerald-50) hover and the primary emerald #0B3B32 for the check mark and chevron. The menu is a portal (see DropdownMenu).
 * It is an ARIA select-only combobox. Keyboard: arrows, Home/End, Enter or Space to pick, Escape to close, typing a letter
 * jumps to the next choice starting with it.
 *
 * Speed: this wrapper is the only part that runs when the parent re-renders. It hands the field a stable `onChange` (the
 * latest one is read through a ref) and the field skips re-rendering unless its visible props changed, so inline handlers and
 * freshly built option lists in a big form cost nothing. Toggling the menu or moving the highlight never re-renders the parent.
 */
export const Dropdown = (props: DropdownProps) => {
  const latest = useRef(props.onChange);
  latest.current = props.onChange;
  const onChange = useCallback((value: string) => latest.current(value), []);
  return <DropdownField {...props} onChange={onChange} />;
};
