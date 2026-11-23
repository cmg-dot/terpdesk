import { GENERIC_SETTINGS } from "@/lib/genericSetting";

/**
 * The choices our request forms offer, for screens that filter by them (client-safe: pure). The settings are the New request and
 * Edit request forms' list (which also holds every setting the public website form offers); the formats are In person, Virtual and the
 * forms' Hybrid choice, which the Website requests board shows as "Hybrid". A test keeps this list level with the forms.
 */
export const REQUEST_SETTINGS = ["Education", "Medical", "Mental Health", "Workplace", "Legal", "Community", "Other"] as const;
export const REQUEST_FORMATS = ["In person", "Virtual", "Hybrid"] as const;

/**
 * The settings a filter lists: the forms' choices, then the rest of the system's generic categories (the ones outbound email and
 * client access use: Social Services, Employment, General). "Educational" is the forms' "Education", so it is not listed twice.
 */
export const FILTER_SETTINGS: readonly string[] = [
  ...REQUEST_SETTINGS,
  ...GENERIC_SETTINGS.filter((generic) => generic !== "Educational" && !REQUEST_SETTINGS.some((own) => own.toLowerCase() === generic.toLowerCase())),
];
