import { Calendar, Clock } from "lucide-react";
import type { InputHTMLAttributes } from "react";

type IconInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** "date" shows a calendar icon, "time" a clock. */
  kind: "date" | "time";
  /** Classes for the wrapper (the input's own look comes from `className`). Default: full width, shrinkable inside a flex row. */
  wrapperClassName?: string;
  /** Smaller icon and less left padding, for dense rows (e.g. the weekly hours list). */
  compact?: boolean;
};

/**
 * A native date or time input with its icon inside, on the left. The native picker still works: the browser's own
 * (now invisible) picker button stays at the right edge of the field, so tapping there opens the calendar or the
 * clock exactly as before, and typing, keyboard use and mobile pickers are untouched.
 */
export function IconInput({ kind, className = "", wrapperClassName = "relative w-full min-w-0", compact = false, ...rest }: IconInputProps) {
  const Icon = kind === "date" ? Calendar : Clock;
  const iconClass = compact ? "left-2.5 h-3.5 w-3.5" : "left-4 h-4 w-4";
  return (
    <div className={wrapperClassName}>
      <Icon aria-hidden="true" strokeWidth={1.75} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-500 ${iconClass}`} />
      <input
        {...rest}
        type={kind}
        // pl-11 (pl-8 compact) clears the icon; the invisible WebKit picker button keeps its click target at the right edge.
        className={`${className} ${compact ? "pl-8" : "pl-11"} [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0`}
      />
    </div>
  );
}
