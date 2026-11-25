import { formatInTimeZone } from "date-fns-tz";
import type { CeuUnit } from "@/lib/validation/ceu";
import { UNIT_LABEL } from "@/lib/validation/ceu";

/**
 * The rules that join an entry to its cycle, as one pure place the server actions call (the form shows the server's message).
 * An entry in a cycle takes the cycle's unit and must fall inside its dates; a cycle's unit or dates may not change in a way that
 * leaves an assigned entry outside them or in another unit.
 */

interface CycleWindow {
  cycleStart: string;
  cycleEnd: string;
  unit: CeuUnit;
}

const shown = (day: string): string => formatInTimeZone(new Date(`${day}T12:00:00Z`), "UTC", "MMM d, yyyy");

/** Null when the date is inside the cycle; otherwise the message. */
export function entryOutsideCycle(earnedOn: string, cycle: Pick<CycleWindow, "cycleStart" | "cycleEnd">): string | null {
  if (earnedOn >= cycle.cycleStart && earnedOn <= cycle.cycleEnd) return null;
  return `That date is outside this cycle (${shown(cycle.cycleStart)} to ${shown(cycle.cycleEnd)}).`;
}

/** Null when the new dates and unit leave every assigned entry where it belongs; otherwise the message. */
export function cycleChangeBlocked(next: CycleWindow, assigned: readonly { earnedOn: string; unit: CeuUnit }[]): string | null {
  if (assigned.length === 0) return null;
  if (assigned.some((e) => e.unit !== next.unit)) {
    return `Entries in this cycle are logged in ${UNIT_LABEL[assigned[0].unit].toLowerCase()}. Move or delete them to change the unit.`;
  }
  const outside = assigned.filter((e) => e.earnedOn < next.cycleStart || e.earnedOn > next.cycleEnd).length;
  if (outside > 0) return `${outside} logged ${outside === 1 ? "entry falls" : "entries fall"} outside these dates. Widen the dates, or move those entries first.`;
  return null;
}
