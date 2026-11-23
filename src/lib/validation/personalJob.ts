import { z } from "zod";
import { countedMiles } from "@/lib/personalJobs";
import { FILTER_SETTINGS } from "@/lib/requestOptions";
import { roundMiles } from "@/lib/timesheetSchemas";
import { getIanaZone, wallClockToUtcDate } from "@/utils/timezone";

/**
 * What a personal job form sends, and the one parse that counts (the browser runs it for instant feedback, the server action runs it
 * again). Times arrive as wall-clock date and time in the interpreter's zone and leave as UTC. Pure.
 */

/** The most personal jobs one interpreter can keep. */
export const MAX_PERSONAL_JOBS = 2000;
/** The longest single job: a day. */
export const MAX_PERSONAL_JOB_MINUTES = 24 * 60;
export const MAX_BREAK_MINUTES = 480;
export const MAX_MILES = 2000;
export const LABEL_MAX = 80;
/** Shown under the label field. */
export const LABEL_HINT = "No client names";

const realDate = (label: string) =>
  z.string().trim().refine((v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, `Enter a valid ${label}.`);
const clock = (label: string) => z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `Enter a valid ${label}.`);

/** The form's raw values (strings, as a form posts them). */
export const personalJobSchema = z.object({
  label: z.string().trim().max(LABEL_MAX, `The label must be ${LABEL_MAX} characters or fewer.`).default(""),
  setting: z.string().trim().refine((v) => v === "" || FILTER_SETTINGS.includes(v), "Choose a setting from the list.").default(""),
  startDate: realDate("start date"),
  startTime: clock("start time"),
  endDate: realDate("end date"),
  endTime: clock("end time"),
  timeZone: z.string().trim().min(1, "Choose a time zone.").max(80, "Choose a time zone.").default("America/Los_Angeles"),
  breakMinutes: z.string().trim().regex(/^\d{0,3}$/, "Use whole minutes.").default(""),
  miles: z.string().trim().regex(/^\d{0,4}(\.\d{1,2})?$/, "Enter miles as a number, like 12.5.").default(""),
  roundTrip: z.boolean().default(false),
});

export type PersonalJobInput = z.input<typeof personalJobSchema>;
export type PersonalJobField = keyof PersonalJobInput | "form";

/** A checked personal job, ready to store. */
export interface PersonalJobValues {
  label: string | null;
  setting: string | null;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  breakMinutes: number;
  miles: number | null;
  roundTrip: boolean;
  countedMiles: number | null;
}

export type PersonalJobParse =
  | { ok: true; data: PersonalJobValues }
  | { ok: false; error: string; fieldErrors: Partial<Record<PersonalJobField, string>> };

const fail = (fieldErrors: Partial<Record<PersonalJobField, string>>): PersonalJobParse => ({
  ok: false,
  error: "Please fix the highlighted fields.",
  fieldErrors,
});

export function parsePersonalJob(input: unknown): PersonalJobParse {
  const parsed = personalJobSchema.safeParse(input ?? {});
  if (!parsed.success) {
    const fieldErrors: Partial<Record<PersonalJobField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field as PersonalJobField]) fieldErrors[field as PersonalJobField] = issue.message;
    }
    return fail(fieldErrors);
  }
  const v = parsed.data;
  const timeZone = getIanaZone(v.timeZone);
  const startsAt = wallClockToUtcDate({ dateStr: v.startDate, timeStr: v.startTime, timeZone });
  const endsAt = wallClockToUtcDate({ dateStr: v.endDate, timeStr: v.endTime, timeZone });
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return fail({ startDate: "Enter a valid start date and time." });

  const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  if (minutes <= 0) return fail({ endTime: "The end must be after the start." });
  if (minutes > MAX_PERSONAL_JOB_MINUTES) return fail({ endTime: "A single job can be at most 24 hours. Log longer work as separate jobs." });

  const breakMinutes = v.breakMinutes === "" ? 0 : Number(v.breakMinutes);
  if (breakMinutes > MAX_BREAK_MINUTES) return fail({ breakMinutes: `A break can be at most ${MAX_BREAK_MINUTES} minutes.` });
  if (breakMinutes >= minutes) return fail({ breakMinutes: "The break must be shorter than the job." });

  const miles = v.miles === "" ? null : roundMiles(Number(v.miles));
  if (miles !== null && miles > MAX_MILES) return fail({ miles: `Miles can be at most ${MAX_MILES}.` });

  return {
    ok: true,
    data: {
      label: v.label === "" ? null : v.label,
      setting: v.setting === "" ? null : v.setting,
      startsAt,
      endsAt,
      timeZone,
      breakMinutes,
      miles,
      roundTrip: v.roundTrip,
      countedMiles: countedMiles(miles, v.roundTrip),
    },
  };
}
