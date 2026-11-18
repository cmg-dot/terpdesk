"use client";

import { useState } from "react";
import { IconInput } from "@/components/ui/IconInput";

interface DateTimeInputProps {
  /** yyyy-MM-ddTHH:mm (what a native datetime-local input held), or "" for none. */
  value: string;
  onChange: (value: string) => void;
  /** The date half takes this id (so a label's htmlFor points at it); the time half takes `${id}-time`. */
  id: string;
  /** Spoken names for the two halves, e.g. "Actual start". */
  label: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
}

const split = (value: string) => {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
};

/**
 * A date and a time side by side, with the app's calendar and time pickers, standing in for a native datetime-local input:
 * the value is the same yyyy-MM-ddTHH:mm text. Until both halves are picked the value stays "" (the half picked so far is kept).
 */
export function DateTimeInput({ value, onChange, id, label, className = "", disabled = false, clearable = false }: DateTimeInputProps) {
  const [draft, setDraft] = useState({ date: "", time: "" });
  const parts = value ? split(value) : draft;
  const set = (field: "date" | "time", next: string) => {
    const updated = { ...parts, [field]: next };
    setDraft(updated);
    onChange(updated.date && updated.time ? `${updated.date}T${updated.time}` : "");
  };

  return (
    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-2" data-date-time={id}>
      <IconInput kind="date" id={id} value={parts.date} onChange={(e) => set("date", e.target.value)} disabled={disabled} clearable={clearable} aria-label={`${label} date`} className={className} />
      <IconInput kind="time" id={`${id}-time`} value={parts.time} onChange={(e) => set("time", e.target.value)} disabled={disabled} clearable={clearable} aria-label={`${label} time`} className={className} />
    </div>
  );
}
