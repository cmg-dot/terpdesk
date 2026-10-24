import { z } from "zod";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { RequestData } from "@/db/schema";
import { normalizeRequestData } from "@/lib/requestData";
import { getIanaZone } from "@/utils/timezone";

/**
 * The public client intake form (a separate website) -> a new DRAFT request.
 *
 * `parsePublicIntake` validates the flat JSON the form's server sends; `buildPublicRequest` maps it onto the same
 * request shape the agency's own "New request" form saves. Pure functions, no database access.
 *
 * Privacy rules (security.md / HIPAA):
 *  - The form sends no title; one is generated from the generic setting only.
 *  - Only the fields listed here are ever read. Anything else in the payload (a `status`, `program`, `title`,
 *    notes fields, ...) is ignored, never stored, and only its NAME is reported back.
 *  - Error messages never repeat a submitted value.
 *  - The program is always General, so a public submission can never become a state (ODHH / Apple Health) job.
 */

export const SETTINGS = ["Education", "Medical", "Workplace", "Legal", "Community", "Other"] as const;
export const FORMATS = ["In person", "Virtual", "Hybrid — in person and virtual"] as const;
export const CONTACT_METHODS = ["No preference given", "Email", "Phone call", "Text message"] as const;
export const TEAM_SUGGESTIONS = ["Not sure", "One interpreter", "Team of two"] as const;
/** The labels the agency screens use for time zones (the edit page's dropdown expects exactly these). */
export const TIME_ZONE_LABELS = [
  "Pacific Time — Seattle, Los Angeles",
  "Mountain Time — Denver",
  "Arizona (no daylight saving)",
  "Central Time — Chicago",
  "Eastern Time — New York",
  "Alaska Time",
  "Hawaii Time",
] as const;
type TimeZoneLabel = (typeof TIME_ZONE_LABELS)[number];

/** IANA names are accepted too, and stored as the matching label. */
const IANA_TO_LABEL: Record<string, TimeZoneLabel> = {
  "America/Los_Angeles": TIME_ZONE_LABELS[0],
  "America/Denver": TIME_ZONE_LABELS[1],
  "America/Phoenix": TIME_ZONE_LABELS[2],
  "America/Chicago": TIME_ZONE_LABELS[3],
  "America/New_York": TIME_ZONE_LABELS[4],
  "America/Anchorage": TIME_ZONE_LABELS[5],
  "Pacific/Honolulu": TIME_ZONE_LABELS[6],
};

const MAX_DURATION_HOURS = 24;
const MAX_DAYS_AHEAD = 730;
const DAY_MS = 86_400_000;

/** Strips control characters, normalises line breaks, trims. Single-line fields also lose their line breaks. */
export function cleanText(value: string, multiline: boolean): string {
  const noControl = value.replace(/\r\n?/g, "\n").replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, " ");
  return (multiline ? noControl : noControl.replace(/\s+/g, " ")).trim();
}

const emptyToUndefined = (v: unknown, multiline: boolean): unknown => (typeof v === "string" ? cleanText(v, multiline) || undefined : v ?? undefined);
const text = (max: number, multiline = false) =>
  z.preprocess((v) => emptyToUndefined(v, multiline), z.string({ invalid_type_error: "Must be text." }).max(max, `Must be ${max} characters or fewer.`).optional());
const requiredText = (max: number, multiline = false) =>
  z.preprocess(
    (v) => emptyToUndefined(v, multiline),
    z.string({ required_error: "Required.", invalid_type_error: "Must be text." }).min(1, "Required.").max(max, `Must be ${max} characters or fewer.`),
  );
const email = z.preprocess(
  (v) => (typeof v === "string" ? cleanText(v, false).toLowerCase() || undefined : v ?? undefined),
  z.string({ invalid_type_error: "Must be text." }).max(254, "Too long.").email("Must be a valid email address.").optional(),
);
const choice = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { errorMap: () => ({ message: "Choose one of the allowed values." }) });
const flag = z.preprocess(
  (v) => (v === "true" ? true : v === "false" ? false : v ?? false),
  z.boolean({ invalid_type_error: "Must be true or false." }),
);

const isRealDate = (value: string): boolean => {
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
};
const dateField = z
  .string({ required_error: "Required.", invalid_type_error: "Must be text." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format yyyy-MM-dd.")
  .refine(isRealDate, "That date does not exist.");
const timeField = z
  .string({ required_error: "Required.", invalid_type_error: "Must be text." })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm.");

const timeZone = z
  .string({ required_error: "Required.", invalid_type_error: "Must be text." })
  .transform((v) => cleanText(v, false))
  .pipe(
    z.string().refine((v) => (TIME_ZONE_LABELS as readonly string[]).includes(v) || v in IANA_TO_LABEL, "Choose one of the allowed time zones."),
  )
  .transform((v): TimeZoneLabel => (IANA_TO_LABEL[v] ?? (v as TimeZoneLabel)));

const shape = {
  requesterName: text(200),
  requesterOrg: text(200),
  email,
  phone: text(40),
  prefContact: z.preprocess((v) => v ?? undefined, choice(CONTACT_METHODS).default("No preference given")),
  setting: choice(SETTINGS),
  purpose: requiredText(2000, true),
  timeZone,
  startDate: dateField,
  startTime: timeField,
  endDate: z.preprocess((v) => emptyToUndefined(v, false), dateField.optional()),
  endTime: timeField,
  format: choice(FORMATS),
  venue: text(200),
  address: text(300),
  building: text(500),
  parking: text(500),
  entrance: text(500),
  onsiteContactName: text(200),
  onsiteContactPhone: text(200),
  peopleNeeding: text(40),
  commPreferences: text(500),
  qualifications: text(1000, true),
  prefInterpreter: text(200),
  teamSuggested: z.preprocess((v) => v ?? undefined, choice(TEAM_SUGGESTIONS).default("Not sure")),
  repeats: flag,
  recurrenceNote: text(1000, true),
  billOrg: text(200),
  billContact: text(200),
  billEmail: email,
  poNumber: text(100),
  /** The form's own id for this submission; sending the same one again returns the first request instead of a duplicate. */
  submissionId: z.preprocess((v) => emptyToUndefined(v, false), z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Use 8-64 letters, digits, - or _.").optional()),
};

export const ACCEPTED_FIELDS = Object.keys(shape);

export interface ResolvedTimes {
  startsAt: string;
  endsAt: string;
  ianaZone: string;
}

/** Appointment start/end as UTC, read in the appointment's own time zone. Returns a message when they are not usable. */
export function resolveTimes(
  v: { startDate: string; startTime: string; endDate?: string; endTime: string; timeZone: string },
  now: Date,
): ResolvedTimes | { error: string; field: "startDate" | "endTime" } {
  const ianaZone = getIanaZone(v.timeZone);
  const endDate = v.endDate ?? v.startDate;
  const start = fromZonedTime(`${v.startDate}T${v.startTime}:00`, ianaZone);
  const end = fromZonedTime(`${endDate}T${v.endTime}:00`, ianaZone);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: "That date and time could not be read.", field: "startDate" };
  // A time skipped by a clock change (e.g. 02:30 on the spring-forward day) does not exist: reject it, don't shift it.
  if (formatInTimeZone(start, ianaZone, "yyyy-MM-dd HH:mm") !== `${v.startDate} ${v.startTime}`) return { error: "That start time does not exist on that date.", field: "startDate" };
  if (formatInTimeZone(end, ianaZone, "yyyy-MM-dd HH:mm") !== `${endDate} ${v.endTime}`) return { error: "That end time does not exist on that date.", field: "endTime" };
  if (start.getTime() <= now.getTime()) return { error: "The appointment must start in the future.", field: "startDate" };
  if (start.getTime() > now.getTime() + MAX_DAYS_AHEAD * DAY_MS) return { error: "The appointment is too far in the future.", field: "startDate" };
  if (end.getTime() <= start.getTime()) return { error: "The end time must be after the start time.", field: "endTime" };
  if ((end.getTime() - start.getTime()) / 3_600_000 > MAX_DURATION_HOURS) return { error: "The appointment cannot be longer than 24 hours.", field: "endTime" };
  return { startsAt: start.toISOString(), endsAt: end.toISOString(), ianaZone };
}

export type PublicIntake = z.infer<z.ZodObject<typeof shape>> & ResolvedTimes;

export interface FieldProblem {
  field: string;
  message: string;
}

export type PublicIntakeParse =
  | { ok: true; data: PublicIntake; ignoredFields: string[] }
  | { ok: false; fields: FieldProblem[] };

export function parsePublicIntake(body: unknown, now: Date = new Date()): PublicIntakeParse {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, fields: [{ field: "body", message: "Send a JSON object." }] };

  const problems: FieldProblem[] = [];
  const schema = z.object(shape).superRefine((v, ctx) => {
    const add = (field: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    if (!v.requesterName && !v.requesterOrg) add("requesterName", "Provide a requester name or organization.");
    if (!v.email && !v.phone) add("email", "Provide an email address or a phone number.");
    if (v.repeats && !v.recurrenceNote) add("recurrenceNote", "Describe the repeating pattern.");
    if (v.format !== "Virtual" && !v.venue && !v.address) add("venue", "Provide a venue or address for the in-person part.");
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problems.push({ field: String(issue.path[0] ?? "body"), message: issue.message });
    return { ok: false, fields: problems };
  }

  // Times are only checked once the fields themselves are valid (they need all four plus the zone).
  const times = resolveTimes(parsed.data, now);
  if ("error" in times) return { ok: false, fields: [{ field: times.field, message: times.error }] };

  const ignoredFields = Object.keys(body).filter((key) => !ACCEPTED_FIELDS.includes(key));
  return { ok: true, data: { ...parsed.data, ...times }, ignoredFields };
}

export interface PublicRequestDraft {
  title: string;
  startsAt: string;
  endsAt: string;
  data: RequestData;
}

/** The generic title: the setting only. The public form has no title, and participant names never go in one. */
export const publicRequestTitle = (setting: string): string => `Interpreter Request - ${setting}`;

export function buildPublicRequest(input: PublicIntake, receivedAt: Date = new Date()): PublicRequestDraft {
  const isVirtual = input.format === "Virtual";
  const location = input.venue || input.address || (isVirtual ? "Virtual" : "TBD");

  const data = normalizeRequestData(
    {
      brief: {},
      // Always General: a public submission is never an ODHH / Apple Health (state) job.
      intake: { program: "General" },
      overview: { location, status: "Unfilled / draft" },
      details: {
        setting: input.setting,
        purpose: input.purpose,
        format: input.format,
        timeZone: input.timeZone,
        timezone: input.timeZone,
        startDate: input.startDate,
        startTime: input.startTime,
        endDate: input.endDate ?? input.startDate,
        endTime: input.endTime,
        peopleNeeding: input.peopleNeeding,
        commPreferences: input.commPreferences,
        qualifications: input.qualifications,
      },
      onsite: {
        venue: input.venue,
        address: input.address,
        building: input.building,
        parking: input.parking,
        entrance: input.entrance,
        contact: input.onsiteContactName,
        contactMethod: input.onsiteContactPhone,
      },
      requester: {
        name: input.requesterName,
        org: input.requesterOrg,
        email: input.email,
        phone: input.phone,
        prefContact: input.prefContact,
        reqInterpreter: input.prefInterpreter,
        teamSuggested: input.teamSuggested,
        billOrg: input.billOrg,
        billContact: input.billContact,
        billEmail: input.billEmail,
        poNumber: input.poNumber,
        // A one-time requester: staff see exactly what was submitted, and the edit page never swaps in a saved
        // client's contact just because the organisation name matches.
        oneTime: true,
      },
      repeats: input.repeats,
      recurrenceNote: input.repeats ? input.recurrenceNote ?? "" : "",
      // Staff decide the positions; the form's team answer is only a suggestion (requester.teamSuggested).
      positions: "One interpreter",
      source: { channel: "public_intake_form", receivedAt: receivedAt.toISOString(), ...(input.submissionId ? { submissionId: input.submissionId } : {}) },
    },
    input.startsAt,
    input.endsAt,
  );

  return { title: publicRequestTitle(input.setting), startsAt: input.startsAt, endsAt: input.endsAt, data };
}
