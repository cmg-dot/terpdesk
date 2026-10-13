"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  X,
  Check,
  Trash2,
  Lock,
  Edit2,
  Calendar as CalendarIcon,
  AlertTriangle,
} from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { useGlobalState } from "@/context/GlobalContext";
import { getIanaZone } from "@/utils/timezone";
import {
  td_save_availability,
  td_update_interpreter_timezone,
  td_save_busy,
  td_delete_busy,
  td_availability_view,
  AvailabilityRuleInput,
  AvailabilityExceptionInput,
} from "@/app/actions/availability";

export interface Rule {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface Exception {
  id?: string;
  date: string;
  available: boolean;
  startMinute?: number;
  endMinute?: number;
}

export interface BusyBlock {
  id: string;
  title?: string;
  label?: string;
  timeZone: string;
  isAllDay?: boolean;
  start?: string;
  end?: string;
  startsAt?: string;
  endsAt?: string;
  revision?: number;
}

const timeStringToMinutes = (time: string): number => {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minutesToTimeString = (minutes?: number | null): string => {
  if (minutes == null) return "";
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const TIMEZONE_OPTIONS = [
  { value: "America/Los_Angeles", label: "Pacific Time — Seattle, Los Angeles" },
  { value: "America/Denver", label: "Mountain Time — Denver" },
  { value: "America/Phoenix", label: "Arizona (no daylight saving)" },
  { value: "America/Chicago", label: "Central Time — Chicago" },
  { value: "America/New_York", label: "Eastern Time — New York" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
];

export interface ConnectedAvailabilityProps {
  interpreterId?: string;
  currentTimezone?: string;
  onAvailabilityChanged?: () => void;
  onTimezoneChanged?: (newTimezone: string) => void;
}

export default function ConnectedAvailability({
  interpreterId: propInterpreterId,
  currentTimezone,
  onAvailabilityChanged,
  onTimezoneChanged,
}: ConnectedAvailabilityProps) {
  const { currentUser } = useGlobalState();
  const activeInterpreterId = propInterpreterId || currentUser?.id || "terp-1";

  const [baseTimezone, setBaseTimezone] = useState<string>(() => {
    if (currentTimezone) return currentTimezone;
    if (typeof window !== "undefined") {
      try {
        const storedTz = localStorage.getItem("terpdesk_interpreter_timezone");
        if (storedTz) return storedTz;
        const storedAvail = localStorage.getItem("terpdesk_availability");
        if (storedAvail) {
          const parsed = JSON.parse(storedAvail);
          if (parsed?.baseTimezone) return parsed.baseTimezone;
        }
      } catch (e) {}
    }
    return "America/Los_Angeles";
  });
  const [rules, setRules] = useState<Rule[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, startTransition] = useTransition();
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Private busy state
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState("Busy");
  const [busyAllDay, setBusyAllDay] = useState(false);
  const [busyStartDate, setBusyStartDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [busyStartTime, setBusyStartTime] = useState("09:00");
  const [busyEndDate, setBusyEndDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [busyEndTime, setBusyEndTime] = useState("10:00");

  // Custom UI Delete confirmation modal state (NO window.confirm)
  const [blockToDelete, setBlockToDelete] = useState<BusyBlock | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Keep baseTimezone in sync with parent prop if provided
  useEffect(() => {
    if (currentTimezone && currentTimezone !== baseTimezone) {
      setBaseTimezone(currentTimezone);
    }
  }, [currentTimezone]);

  // Load from PostgreSQL
  useEffect(() => {
    let isCancelled = false;
    async function loadData() {
      setIsLoading(true);
      try {
        const data = await td_availability_view(activeInterpreterId);
        if (isCancelled) return;

        if (data.profile?.timeZone) {
          setBaseTimezone(data.profile.timeZone);
          onTimezoneChanged?.(data.profile.timeZone);
        }

        if (data.rules) {
          setRules(
            data.rules.map((r) => ({
              weekday: r.weekday,
              startMinute: r.startMinute,
              endMinute: r.endMinute,
            }))
          );
        }

        if (data.exceptions) {
          setExceptions(
            data.exceptions.map((e) => ({
              id: e.id,
              date: e.date,
              available: e.available,
              startMinute: e.startMinute,
              endMinute: e.endMinute,
            }))
          );
        }

        if (data.busyBlocks) {
          setBusyBlocks(
            data.busyBlocks.map((b) => ({
              id: b.id,
              title: b.title || "Busy",
              label: b.title || "Busy",
              timeZone: b.timeZone || "America/Los_Angeles",
              startsAt: b.startsAt,
              endsAt: b.endsAt,
              revision: b.revision,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load availability from PostgreSQL:", err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    loadData();
    return () => {
      isCancelled = true;
    };
  }, [activeInterpreterId]);

  // Sync to local storage for backward-compatible client cache
  useEffect(() => {
    if (isLoading) return;
    try {
      const weeklySchedule: any = {};
      for (const rule of rules) {
        weeklySchedule[rule.weekday] = {
          available: true,
          startMinute: rule.startMinute,
          endMinute: rule.endMinute,
        };
      }
      const payload = {
        baseTimezone,
        weeklySchedule,
        dateOverrides: exceptions,
        rules,
        exceptions,
      };
      localStorage.setItem("terpdesk_availability", JSON.stringify(payload));
    } catch (e) {
      console.error(e);
    }
  }, [rules, exceptions, baseTimezone, isLoading]);

  // Save weekly hours and exceptions to PostgreSQL
  const handleSaveAvailability = () => {
    startTransition(async () => {
      try {
        await td_save_availability({
          interpreterId: activeInterpreterId,
          timeZone: baseTimezone,
          rules,
          exceptions: exceptions.map((e) => ({
            date: e.date,
            available: e.available,
            startMinute: e.startMinute,
            endMinute: e.endMinute,
          })),
        });
        setSaveSuccessMsg("Availability saved to database.");
        setTimeout(() => setSaveSuccessMsg(null), 3500);
        onAvailabilityChanged?.();
      } catch (err) {
        console.error(err);
      }
    });
  };

  // Add weekday rule
  const handleAddRule = (weekday: number) => {
    setRules((prev) => {
      if (prev.some((r) => r.weekday === weekday)) return prev;
      return [...prev, { weekday, startMinute: 540, endMinute: 1020 }].sort(
        (a, b) => a.weekday - b.weekday
      );
    });
  };

  const handleUpdateRule = (
    weekday: number,
    field: "startMinute" | "endMinute",
    value: number
  ) => {
    setRules((prev) =>
      prev.map((r) => (r.weekday === weekday ? { ...r, [field]: value } : r))
    );
  };

  const handleRemoveRule = (weekday: number) => {
    setRules((prev) => prev.filter((r) => r.weekday !== weekday));
  };

  // Exception Handlers
  const handleAddException = () => {
    const today = new Date().toISOString().split("T")[0];
    setExceptions((prev) => [...prev, { date: today, available: false }]);
  };

  const handleUpdateException = (idx: number, updates: Partial<Exception>) => {
    setExceptions((prev) =>
      prev.map((ex, i) => (i === idx ? { ...ex, ...updates } : ex))
    );
  };

  const handleRemoveException = (idx: number) => {
    setExceptions((prev) => prev.filter((_, i) => i !== idx));
  };

  // Populate form for editing a busy block
  const handleEditBlock = (block: BusyBlock) => {
    setEditingBlockId(block.id);
    setBusyLabel(block.title || block.label || "Busy");
    const safeZone = getIanaZone(baseTimezone);

    if (block.startsAt && block.endsAt) {
      const s = new Date(block.startsAt);
      const e = new Date(block.endsAt);
      const startT = formatInTimeZone(s, safeZone, "HH:mm");
      const endT = formatInTimeZone(e, safeZone, "HH:mm");
      const sDate = formatInTimeZone(s, safeZone, "yyyy-MM-dd");

      setBusyStartDate(sDate);
      setBusyStartTime(startT);

      if (startT === "00:00" && endT === "00:00") {
        setBusyAllDay(true);
        const dayBeforeEnd = new Date(e.getTime() - 1000);
        setBusyEndDate(formatInTimeZone(dayBeforeEnd, safeZone, "yyyy-MM-dd"));
      } else {
        setBusyAllDay(false);
        setBusyEndDate(formatInTimeZone(e, safeZone, "yyyy-MM-dd"));
        setBusyEndTime(endT);
      }
    }

    document.getElementById("private-busy-time")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  // Cancel editing busy block
  const handleCancelEdit = () => {
    setEditingBlockId(null);
    setBusyLabel("Busy");
    setBusyAllDay(false);
    setBusyStartDate(new Date().toISOString().split("T")[0]);
    setBusyStartTime("09:00");
    setBusyEndDate(new Date().toISOString().split("T")[0]);
    setBusyEndTime("10:00");
  };

  // Save or update private busy block in PostgreSQL
  const handleSaveBusyBlock = () => {
    startTransition(async () => {
      try {
        await td_save_busy({
          id: editingBlockId || undefined,
          interpreterId: activeInterpreterId,
          title: busyLabel || "Busy",
          timeZone: baseTimezone,
          isAllDay: busyAllDay,
          startDate: busyStartDate,
          startTime: busyStartTime,
          endDate: busyEndDate,
          endTime: busyEndTime,
        });

        // Refresh blocks from PostgreSQL
        const data = await td_availability_view(activeInterpreterId);
        setBusyBlocks(
          data.busyBlocks.map((b) => ({
            id: b.id,
            title: b.title || "Busy",
            label: b.title || "Busy",
            timeZone: b.timeZone || "America/Los_Angeles",
            startsAt: b.startsAt,
            endsAt: b.endsAt,
            revision: b.revision,
          }))
        );

        handleCancelEdit();
        setSaveSuccessMsg(
          editingBlockId
            ? "Private busy block updated."
            : "Private busy block saved."
        );
        setTimeout(() => setSaveSuccessMsg(null), 3500);
        onAvailabilityChanged?.();
      } catch (err) {
        console.error("Failed to save busy block:", err);
      }
    });
  };

  // Confirm delete busy block from PostgreSQL (modal trigger)
  const handleConfirmDelete = async () => {
    if (!blockToDelete) return;
    setIsDeleting(true);
    try {
      await td_delete_busy(blockToDelete.id);
      setBusyBlocks((prev) => prev.filter((b) => b.id !== blockToDelete.id));
      if (editingBlockId === blockToDelete.id) {
        handleCancelEdit();
      }
      setBlockToDelete(null);
      setSaveSuccessMsg("Busy block removed.");
      setTimeout(() => setSaveSuccessMsg(null), 3500);
      onAvailabilityChanged?.();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Format local date/time strictly in the master Base Time Zone
  const formatBusyBlockDisplay = (b: BusyBlock) => {
    const tz = getIanaZone(baseTimezone);
    if (!b.startsAt || !b.endsAt) {
      return b.start ? `${b.start} – ${b.end}` : "Busy";
    }

    const start = new Date(b.startsAt);
    const end = new Date(b.endsAt);

    const startH = formatInTimeZone(start, tz, "HH:mm");
    const endH = formatInTimeZone(end, tz, "HH:mm");
    const startDateStr = formatInTimeZone(start, tz, "MMM d, yyyy");

    if (startH === "00:00" && endH === "00:00") {
      const dayBeforeEnd = new Date(end.getTime() - 1000);
      const endDateStr = formatInTimeZone(dayBeforeEnd, tz, "MMM d, yyyy");
      if (startDateStr === endDateStr) {
        return `${startDateStr} · All day`;
      }
      return `${startDateStr} – ${endDateStr} · All day`;
    }

    const startStr = formatInTimeZone(start, tz, "MMM d, yyyy · h:mm a");
    const endStr = formatInTimeZone(end, tz, "h:mm a zzz");
    return `${startStr} – ${endStr}`;
  };

  return (
    <div className="space-y-8">
      {/* Timezone Preference */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <div>
            <h3 className="font-semibold text-[var(--ink)] text-base">
              Profile Timezone
            </h3>
            <p className="text-xs text-[var(--sage)] mt-0.5">
              Your weekly rules and appointment hours are evaluated in this timezone.
            </p>
          </div>
          <select
            value={baseTimezone}
            onChange={(e) => {
              const newTz = e.target.value;
              setBaseTimezone(newTz);
              onTimezoneChanged?.(newTz);
              if (typeof window !== "undefined") {
                try {
                  localStorage.setItem(`terpdesk_timezone_${activeInterpreterId}`, newTz);
                  localStorage.setItem("terpdesk_interpreter_timezone", newTz);
                  const stored = localStorage.getItem("terpdesk_availability");
                  const parsed = stored ? JSON.parse(stored) : {};
                  parsed.baseTimezone = newTz;
                  localStorage.setItem("terpdesk_availability", JSON.stringify(parsed));
                } catch (err) {}
              }
              startTransition(async () => {
                try {
                  await td_update_interpreter_timezone({
                    interpreterId: activeInterpreterId,
                    timeZone: newTz,
                  });
                  onAvailabilityChanged?.();
                } catch (err) {
                  console.error("Failed to auto-save timezone:", err);
                }
              });
            }}
            className="bg-[#F5F4F0] border-none rounded-xl px-4 py-2.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[#1B433C]/20"
          >
            {TIMEZONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Card 1: Usual weekly hours */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-[var(--ink)] text-base">
              Usual weekly hours
            </h3>
            <p className="text-xs text-[var(--sage)]">
              Specify your recurring weekly schedule. Days without rules are treated as not provided.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveAvailability}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1B433C] text-white text-xs font-medium hover:bg-[#14332D] transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isSaving ? "Saving..." : "Save hours"}
          </button>
        </div>

        {saveSuccessMsg && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        <div className="flex flex-col divide-y divide-gray-100">
          {DAYS_OF_WEEK.map((day, idx) => {
            const rule = rules.find((r) => r.weekday === idx);
            return (
              <div
                key={day}
                className="flex flex-col sm:flex-row sm:items-center py-3.5 first:pt-0 last:pb-0 gap-3"
              >
                <div className="w-32 font-medium text-sm text-[var(--ink)]">
                  {day}
                </div>
                <div className="flex-1">
                  {!rule ? (
                    <div className="text-xs text-gray-400">Not provided</div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={minutesToTimeString(rule.startMinute)}
                        onChange={(e) =>
                          handleUpdateRule(
                            idx,
                            "startMinute",
                            timeStringToMinutes(e.target.value)
                          )
                        }
                        className="border border-gray-200 rounded-lg px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-[#1B433C]"
                      />
                      <span className="text-gray-400 text-xs">–</span>
                      <input
                        type="time"
                        value={minutesToTimeString(rule.endMinute)}
                        onChange={(e) =>
                          handleUpdateRule(
                            idx,
                            "endMinute",
                            timeStringToMinutes(e.target.value)
                          )
                        }
                        className="border border-gray-200 rounded-lg px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-[#1B433C]"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(idx)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors cursor-pointer"
                        title="Remove hours"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {!rule && (
                  <button
                    type="button"
                    onClick={() => handleAddRule(idx)}
                    className="px-3.5 py-1 rounded-full border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors shrink-0 self-start sm:self-auto cursor-pointer"
                  >
                    Add hours
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Card 2: Dates that are different */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="font-semibold text-[var(--ink)] mb-1 text-base">
          Dates that are different
        </h3>
        <p className="text-xs text-[var(--sage)] mb-4">
          A date entered here replaces your usual hours for that specific calendar day.
        </p>

        {exceptions.length === 0 ? (
          <p className="text-xs text-gray-400 mb-4">No date exceptions configured.</p>
        ) : (
          <div className="space-y-3 mb-4">
            {exceptions.map((ex, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-50/70 rounded-xl border border-gray-200/60"
              >
                <input
                  type="date"
                  value={ex.date}
                  onChange={(e) => handleUpdateException(idx, { date: e.target.value })}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white outline-none"
                />
                <select
                  value={ex.available ? "available" : "unavailable"}
                  onChange={(e) => {
                    const isAvail = e.target.value === "available";
                    handleUpdateException(idx, {
                      available: isAvail,
                      startMinute: isAvail ? 540 : undefined,
                      endMinute: isAvail ? 1020 : undefined,
                    });
                  }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white outline-none"
                >
                  <option value="unavailable">Not available at all</option>
                  <option value="available">Available these hours</option>
                </select>

                {ex.available && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={minutesToTimeString(ex.startMinute)}
                      onChange={(e) =>
                        handleUpdateException(idx, {
                          startMinute: timeStringToMinutes(e.target.value),
                        })
                      }
                      className="border border-gray-200 rounded-lg px-3 py-1 text-xs bg-white outline-none"
                    />
                    <span className="text-gray-400 text-xs">–</span>
                    <input
                      type="time"
                      value={minutesToTimeString(ex.endMinute)}
                      onChange={(e) =>
                        handleUpdateException(idx, {
                          endMinute: timeStringToMinutes(e.target.value),
                        })
                      }
                      className="border border-gray-200 rounded-lg px-3 py-1 text-xs bg-white outline-none"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleRemoveException(idx)}
                  className="text-gray-400 hover:text-red-500 p-1.5 ml-auto transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleAddException}
          className="px-4 py-2 rounded-full border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors cursor-pointer"
        >
          Add a date
        </button>
      </div>

      {/* Private Busy Time Section */}
      <div id="private-busy-time" className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#1B433C]" />
            <h3 className="font-semibold text-[var(--ink)] text-base">
              Private busy time
            </h3>
          </div>
          {editingBlockId && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
              <Edit2 className="w-3 h-3" />
              Editing saved block
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--sage)] mb-6 max-w-2xl leading-relaxed">
          Only you can see these blocks. Agencies receive no personal details — they only see that you are unavailable. A block never cancels an already accepted appointment.
        </p>

        <div className="space-y-4 max-w-xl">
          <div>
            <label className="block text-xs text-[var(--sage)] mb-1">
              Private label (optional)
            </label>
            <input
              type="text"
              value={busyLabel}
              onChange={(e) => setBusyLabel(e.target.value)}
              placeholder="e.g. Doctor appointment, Personal"
              className="bg-[#F5F4F0] border-none rounded-xl p-3 w-full text-xs text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[#1B433C]/20"
            />
          </div>

          {/* All-day Checkbox */}
          <div className="flex items-center gap-2 my-2">
            <input
              type="checkbox"
              id="busy-all-day"
              checked={busyAllDay}
              onChange={(e) => setBusyAllDay(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-[#1B433C] focus:ring-[#1B433C] cursor-pointer"
            />
            <label htmlFor="busy-all-day" className="text-xs text-[var(--ink)] select-none cursor-pointer font-medium">
              All day
            </label>
          </div>

          {/* Busy Start Date & Time */}
          <div>
            <label className="block text-xs text-[var(--sage)] mb-1">
              Busy start {busyAllDay && <span className="text-[11px] font-normal text-gray-400">(All day)</span>}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={busyStartDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setBusyStartDate(val);
                  if (busyEndDate < val) {
                    setBusyEndDate(val);
                  }
                }}
                className="bg-[#F5F4F0] border-none rounded-xl p-2.5 flex-1 text-xs outline-none"
              />
              {!busyAllDay && (
                <input
                  type="time"
                  value={busyStartTime}
                  onChange={(e) => setBusyStartTime(e.target.value)}
                  className="bg-[#F5F4F0] border-none rounded-xl p-2.5 flex-1 text-xs outline-none"
                />
              )}
            </div>
          </div>

          {/* Busy End Date & Time */}
          <div>
            <label className="block text-xs text-[var(--sage)] mb-1">
              Busy end {busyAllDay && <span className="text-[11px] font-normal text-gray-400">(All day)</span>}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={busyEndDate}
                min={busyStartDate}
                onChange={(e) => setBusyEndDate(e.target.value)}
                className="bg-[#F5F4F0] border-none rounded-xl p-2.5 flex-1 text-xs outline-none"
              />
              {!busyAllDay && (
                <input
                  type="time"
                  value={busyEndTime}
                  onChange={(e) => setBusyEndTime(e.target.value)}
                  className="bg-[#F5F4F0] border-none rounded-xl p-2.5 flex-1 text-xs outline-none"
                />
              )}
            </div>
          </div>

          <p className="text-[11px] text-[var(--sage)] leading-relaxed pt-1">
            Agencies you share availability with only see that you are unavailable — never the label.
          </p>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSaveBusyBlock}
              disabled={isSaving}
              className="bg-[#1B433C] text-white rounded-full px-6 py-2.5 text-xs font-medium hover:bg-[#14332D] transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isSaving
                ? "Saving..."
                : editingBlockId
                ? "Update private busy time"
                : "Save private busy time"}
            </button>
            {editingBlockId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="bg-white border border-gray-200 text-gray-700 rounded-full px-5 py-2.5 text-xs font-medium hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel edit
              </button>
            )}
          </div>
        </div>

        {/* Saved Busy Blocks list */}
        <div className="mt-8 border-t border-gray-100 pt-6">
          <h4 className="font-semibold text-xs text-[var(--ink)] mb-3">
            Saved Busy Blocks ({busyBlocks.length})
          </h4>

          {busyBlocks.length === 0 ? (
            <p className="text-xs text-gray-400">No private busy blocks scheduled.</p>
          ) : (
            <div className="space-y-2.5">
              {busyBlocks.map((b) => {
                const isCurrentlyEditing = editingBlockId === b.id;
                return (
                  <div
                    key={b.id}
                    className={`p-3.5 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 border transition-all ${
                      isCurrentlyEditing
                        ? "bg-amber-50/70 border-amber-300 ring-1 ring-amber-300"
                        : "bg-gray-50/80 border-gray-200/60"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--ink)] text-sm">
                          {b.title || b.label || "Busy"}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200 font-mono">
                          {baseTimezone}
                        </span>
                      </div>
                      <div className="text-[var(--sage)]">
                        {formatBusyBlockDisplay(b)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleEditBlock(b)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                        <span>Edit block</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBlockToDelete(b)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50/70 hover:bg-red-100 text-red-700 text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>Remove block</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Custom React UI Modal for Removing Busy Block (NO window.confirm) */}
      {blockToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 text-red-600">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-semibold text-[var(--ink)]">
                  Remove busy block
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBlockToDelete(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--sage)] leading-relaxed">
              Are you sure you want to remove this block?
            </p>

            <div className="p-3.5 bg-[#F5F4F0] rounded-xl text-xs space-y-1">
              <div className="font-semibold text-[var(--ink)]">
                {blockToDelete.title || blockToDelete.label || "Busy"}
              </div>
              <div className="text-[var(--sage)]">
                {formatBusyBlockDisplay(blockToDelete)}
              </div>
            </div>

            <p className="text-[11px] text-gray-500 leading-relaxed">
              Agencies you share with will no longer see this duration marked as unavailable.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBlockToDelete(null)}
                className="px-4 py-2 rounded-full border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? "Removing..." : "Remove block"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
