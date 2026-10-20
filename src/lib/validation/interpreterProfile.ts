import { z } from "zod";

/** Time zones offered on the profile form (the ones the calendar understands). */
export const PROFILE_TIME_ZONES = [
  { value: "America/Los_Angeles", label: "Pacific Time — Seattle, Los Angeles" },
  { value: "America/Denver", label: "Mountain Time — Denver" },
  { value: "America/Phoenix", label: "Arizona (no daylight saving)" },
  { value: "America/Chicago", label: "Central Time — Chicago" },
  { value: "America/New_York", label: "Eastern Time — New York" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
] as const;

/** Any real IANA zone is accepted, so a zone the calendar already saved never blocks saving the profile. */
const isKnownZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const text = (max: number, label: string) => z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

/** Shared by the profile form (instant feedback) and the server action (the real check). Empty = not set. */
export const interpreterProfileSchema = z.object({
  preferredName: text(80, "Preferred name"),
  photoUrl: text(500, "Photo link").refine(
    (v) => v === "" || /^https:\/\/[^\s"'<>]+$/i.test(v),
    "Use an image link that starts with https://",
  ),
  shortBio: text(600, "Short bio"),
  city: text(100, "City"),
  stateOrRegion: text(100, "State or region"),
  serviceArea: text(200, "Service area"),
  timeZone: z.string().max(64).refine(isKnownZone, "Choose a time zone from the list."),
  takesInPerson: z.boolean(),
  takesVirtual: z.boolean(),
  workEmail: text(255, "Work email").refine(
    (v) => v === "" || z.string().email().safeParse(v).success,
    "Enter a valid email address.",
  ),
  workPhone: text(30, "Work phone").refine(
    (v) => v === "" || /^[0-9+()\-.\s]{7,30}$/.test(v),
    "Use digits, spaces and + ( ) - . only.",
  ),
});

export type InterpreterProfileInput = z.input<typeof interpreterProfileSchema>;
export type InterpreterProfileField = keyof InterpreterProfileInput;

/** Everything the "My Profile" page shows. Account fields (name, sign-in email) are read-only here. */
export interface MyProfile extends InterpreterProfileInput {
  fullName: string;
  signInEmail: string;
  updatedAt: string | null;
}
