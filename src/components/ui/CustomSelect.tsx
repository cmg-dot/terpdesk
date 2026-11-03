"use client";

import { useId, useMemo, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { plainOptions, withCurrent } from "@/lib/dropdown";

interface Props {
  /** The choices, as the text that is shown and stored. Repeats are shown once. */
  options: readonly string[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  /** "large" is the taller filter row on the requests list. */
  size?: "default" | "large";
  ariaLabel?: string;
}

/**
 * The agency forms' string select (client, organization, setting, time zone, filters...): the same call shape the pages used
 * to define for themselves, now drawn by the shared Dropdown so it has the cream menu, border, shadow, emerald scrollbar and
 * fade, and is portalled above modals. The parent owns the value (a refused change never shows as picked); when no `value` is
 * given it keeps its own, starting at the first option. A stored value that is not among the options stays shown.
 */
export const CustomSelect = ({ options, value, onChange, disabled = false, size = "default", ariaLabel }: Props) => {
  const id = useId();
  const [own, setOwn] = useState(options[0] ?? "");
  const current = value ?? own;
  // The pages build `options` afresh on every render (a 300-client list included): rebuild the choices only when the text changes.
  const content = JSON.stringify(options);
  const choices = useMemo(() => withCurrent(plainOptions(Array.from(new Set(options))), current), [content, current]);
  return (
    <Dropdown
      id={id}
      ariaLabel={ariaLabel}
      variant={size === "large" ? "formLarge" : "form"}
      disabled={disabled}
      value={current}
      options={choices}
      className="w-full"
      onChange={(next) => {
        if (value === undefined) setOwn(next);
        onChange?.(next);
      }}
    />
  );
};
