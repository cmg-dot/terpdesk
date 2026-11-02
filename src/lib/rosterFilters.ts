import { isRegisteredInterpreter } from "@/lib/interpreterAccount";
import { isPlaceholderEmail } from "@/lib/placeholderEmail";

/**
 * The advanced filters on the Interpreters directory. Pure functions: safe in client components. Each filter uses the
 * app's single definition of its meaning, so the list can never disagree with the rest of the app:
 *  - Email status: "real" = a usable address, "placeholder" = only the bulk-import stand-in (see placeholderEmail.ts);
 *  - Account status: "registered" = a login is linked to the profile, "shadow" = not yet (see interpreterAccount.ts);
 *  - Credentials: the agency-private certification text (has / none, and a case-insensitive "contains").
 */

export type EmailFilter = "all" | "real" | "placeholder";
export type AccountFilter = "all" | "registered" | "shadow";
export type CredentialFilter = "all" | "has" | "none";

export interface RosterFilters {
  email: EmailFilter;
  account: AccountFilter;
  credentials: CredentialFilter;
  /** Only people whose credentials contain this text (capitals and extra spaces ignored). Empty = no text filter. */
  credentialText: string;
}

export const NO_ROSTER_FILTERS: RosterFilters = { email: "all", account: "all", credentials: "all", credentialText: "" };

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
  const wanted = squash(filters.credentialText);
  if (wanted !== "" && !credentials.includes(wanted)) return false;
  return true;
};

export const applyRosterFilters = <T extends FilterableInterpreter>(items: readonly T[], filters: RosterFilters): T[] =>
  items.filter((item) => matchesRosterFilters(item, filters));

/** How many filters are narrowing the list (the text box counts with the credentials filter as one). */
export const countActiveFilters = (filters: RosterFilters): number =>
  [filters.email !== "all", filters.account !== "all", filters.credentials !== "all" || squash(filters.credentialText) !== ""].filter(Boolean).length;
