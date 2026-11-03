import { isRegisteredInterpreter } from "@/lib/interpreterAccount";
import { isPlaceholderEmail } from "@/lib/placeholderEmail";
import type { DropdownOption } from "@/lib/dropdown";
import { buildFilterOptions, hasFilterTag, splitCredentials } from "@/lib/timelineFilters";

/**
 * The advanced filters on the Interpreters directory. Pure functions: safe in client components. Each filter uses the
 * app's single definition of its meaning, so the list can never disagree with the rest of the app:
 *  - Email status: "real" = a usable address, "placeholder" = only the bulk-import stand-in (see placeholderEmail.ts);
 *  - Account status: "registered" = a login is linked to the profile, "shadow" = not yet (see interpreterAccount.ts);
 *  - Credentials: the agency-private certification text. One dropdown: everyone, has some, has none, or one credential tag.
 *    The tags are the same list the Calendar's Interpreter View offers (see timelineFilters.ts).
 */

export type EmailFilter = "all" | "real" | "placeholder";
export type AccountFilter = "all" | "registered" | "shadow";
export type CredentialFilter = "all" | "has" | "none";

export interface RosterFilters {
  email: EmailFilter;
  account: AccountFilter;
  credentials: CredentialFilter;
  /** Only people holding this one credential tag (capitals and extra spaces ignored). Empty = any. */
  credentialTag: string;
}

export const NO_ROSTER_FILTERS: RosterFilters = { email: "all", account: "all", credentials: "all", credentialTag: "" };

export interface FilterableInterpreter {
  email: string;
  userId?: string | null;
  certification?: string | null;
}

const squash = (value: string): string => value.toLowerCase().replace(/\s+/g, " ").trim();

export const matchesRosterFilters = (item: FilterableInterpreter, filters: RosterFilters): boolean => {
  const placeholder = isPlaceholderEmail(item.email);
  if (filters.email === "real" && placeholder) return false;
  if (filters.email === "placeholder" && !placeholder) return false;

  const registered = isRegisteredInterpreter(item);
  if (filters.account === "registered" && !registered) return false;
  if (filters.account === "shadow" && registered) return false;

  const credentials = squash(item.certification ?? "");
  if (filters.credentials === "has" && credentials === "") return false;
  if (filters.credentials === "none" && credentials !== "") return false;
  if (squash(filters.credentialTag) !== "" && !hasFilterTag(splitCredentials(item.certification), filters.credentialTag)) return false;
  return true;
};

export const applyRosterFilters = <T extends FilterableInterpreter>(items: readonly T[], filters: RosterFilters): T[] =>
  items.filter((item) => matchesRosterFilters(item, filters));

/** How many filters are narrowing the list. */
export const countActiveFilters = (filters: RosterFilters): number =>
  [filters.email !== "all", filters.account !== "all", filters.credentials !== "all" || squash(filters.credentialTag) !== ""].filter(Boolean).length;

const TAG_PREFIX = "tag:";

/** The Credentials dropdown's current choice: "all", "has", "none", or "tag:<credential>". */
export const credentialChoice = (filters: RosterFilters): string => {
  if (filters.credentials === "none") return "none";
  if (squash(filters.credentialTag) !== "") return `${TAG_PREFIX}${filters.credentialTag}`;
  return filters.credentials === "has" ? "has" : "all";
};

/** The filters after the Credentials dropdown is set to `choice` (one choice at a time, so the others are reset). */
export const withCredentialChoice = (filters: RosterFilters, choice: string): RosterFilters => {
  if (choice === "none" || choice === "has") return { ...filters, credentials: choice, credentialTag: "" };
  if (choice.startsWith(TAG_PREFIX)) return { ...filters, credentials: "all", credentialTag: choice.slice(TAG_PREFIX.length) };
  return { ...filters, credentials: "all", credentialTag: "" };
};

/**
 * The Credentials dropdown's choices: everyone, has some, has none, then every credential tag on the roster (A to Z, with
 * how many people hold it): the same tags and counts the Calendar's Interpreter View lists for the same people.
 */
export const credentialChoices = (people: readonly FilterableInterpreter[], filters: RosterFilters): DropdownOption[] => {
  const withTags = people.map((person) => ({ credentials: splitCredentials(person.certification), areas: [] as string[] }));
  const listed = people.filter((person) => squash(person.certification ?? "") !== "").length;
  const { options } = buildFilterOptions(withTags, "credentials", filters.credentialTag);
  return [
    { value: "all", label: "All credentials", count: people.length },
    { value: "has", label: "Has any credentials", count: listed },
    { value: "none", label: "No credentials listed", count: people.length - listed },
    ...options.map((option) => ({ value: `${TAG_PREFIX}${option.value}`, label: option.value, count: option.count, group: "Credentials" })),
  ];
};
