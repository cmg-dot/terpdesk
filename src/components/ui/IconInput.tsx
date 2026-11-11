"use client";

import { Calendar, Clock } from "lucide-react";
import { CalendarGrid } from "@/components/ui/CalendarGrid";
import { PickerField } from "@/components/ui/PickerField";
import { TimeSelector } from "@/components/ui/TimeSelector";
import { formatDateLabel, formatTimeLabel } from "@/lib/dateTimePicker";

/** What `onChange` receives: the same `event.target.value` the native input gave, so no caller changed. */
export interface PickerChangeEvent {
  target: { value: string };
  currentTarget: { value: string };
}

interface IconInputProps {
  /** "date" opens a month calendar, "time" an hour / minute / AM-PM selector. */
  kind: "date" | "time";
  /** yyyy-MM-dd for a date, HH:mm (24 hour) for a time, "" for none. */
  value?: string;
  onChange?: (event: PickerChangeEvent) => void;
  /** Classes for the field (its look, as the page gave the input it replaced). */
  className?: string;
  /** Classes for the wrapper. Default: full width, shrinkable inside a flex row. */
  wrapperClassName?: string;
  /** Smaller icon and less left padding, for dense rows (e.g. the weekly hours list). */
  compact?: boolean;
  disabled?: boolean;
  /** Earliest date that can be picked (dates only). */
  min?: string;
  /** Latest date that can be picked (dates only). */
  max?: string;
  /** Dates only: a "choose a year" list in the calendar, for dates far from today such as a birth date. */
  yearPicker?: boolean;
  id?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/**
 * A date or time field with its icon inside, on the left. Clicking it opens a cream-and-emerald popup: a mini calendar
 * for a date, an hour / minute / AM-PM selector for a time (see PickerField). No typing is needed. The value is still the
 * text a native input held (yyyy-MM-dd, HH:mm) and `onChange` still gets `event.target.value`, so every form works as before.
 */
export function IconInput({
  kind,
  value = "",
  onChange,
  className = "",
  wrapperClassName = "relative w-full min-w-0",
  compact = false,
  disabled = false,
  min,
  max,
  yearPicker = false,
  id,
  placeholder,
  "aria-label": ariaLabel,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: IconInputProps) {
  const Icon = kind === "date" ? Calendar : Clock;
  const iconClass = compact ? "left-2.5 h-3.5 w-3.5" : "left-4 h-4 w-4";
  const emit = (next: string) => onChange?.({ target: { value: next }, currentTarget: { value: next } });

  return (
    <PickerField
      popoverLabel={kind === "date" ? "Choose a date" : "Choose a time"}
      text={kind === "date" ? formatDateLabel(value) : formatTimeLabel(value)}
      placeholder={placeholder ?? (kind === "date" ? "Choose a date" : "Choose a time")}
      icon={<Icon aria-hidden="true" strokeWidth={1.75} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[rgb(var(--forest-rgb)/0.7)] ${iconClass}`} />}
      className={className}
      wrapperClassName={wrapperClassName}
      compact={compact}
      disabled={disabled}
      id={id}
      ariaLabel={ariaLabel}
      invalid={invalid}
      describedBy={describedBy}
    >
      {(close) =>
        kind === "date" ? (
          <CalendarGrid
            value={value}
            min={min}
            max={max}
            yearPicker={yearPicker}
            onPick={(key) => {
              emit(key);
              close();
            }}
            onDone={close}
          />
        ) : (
          <TimeSelector value={value} onPick={emit} onDone={close} />
        )
      }
    </PickerField>
  );
}
