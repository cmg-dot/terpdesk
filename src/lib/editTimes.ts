import { buildAppointmentUtcTimes, resolveRequestTimes } from "@/utils/timezone";

/** The schedule fields an edit form can send (wall-clock date and times, or ready-made instants). */
export interface EditTimeInput {
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  startsAt?: string | Date;
  endsAt?: string | Date;
}

export interface Instants {
  startsAt: string;
  endsAt: string;
}

const iso = (value: string | Date): string => (typeof value === "string" ? value : value.toISOString());
const sameMinute = (a: string, b: string): boolean => Math.floor(Date.parse(a) / 60000) === Math.floor(Date.parse(b) / 60000);

/**
 * The start and end an edit saves (pure). The job's CURRENT times come from the one resolver every screen uses
 * (resolveRequestTimes: the saved edit, else the intake record, else the row), so saving a form that left the times alone
 * writes back exactly what the screens already showed. A time that is unchanged to the minute keeps its stored instant, so
 * re-saving can never drift it.
 */
export function resolveEditedTimes(existing: { createdAt?: Date | string | null; data?: unknown }, input: EditTimeInput, timeZone: string): Instants {
  const current = resolveRequestTimes(existing);
  let next: Instants;
  if (input.startDate && input.startTime && input.endTime) {
    const built = buildAppointmentUtcTimes({ date: input.startDate, startTime: input.startTime, endDate: input.endDate || input.startDate, endTime: input.endTime, timeZone });
    next = { startsAt: built.startsAt, endsAt: built.endsAt };
  } else if (input.startsAt && input.endsAt) {
    next = { startsAt: iso(input.startsAt), endsAt: iso(input.endsAt) };
  } else if (input.startsAt) {
    next = { startsAt: iso(input.startsAt), endsAt: current.endsAt };
  } else {
    next = current;
  }
  return {
    startsAt: sameMinute(next.startsAt, current.startsAt) ? current.startsAt : next.startsAt,
    endsAt: sameMinute(next.endsAt, current.endsAt) ? current.endsAt : next.endsAt,
  };
}
