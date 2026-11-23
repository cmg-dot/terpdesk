import { Briefcase, Building, Calendar, ClipboardList, FileText, Home, Navigation, Settings, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The interpreter workspace's navigation, in one place (agencyNav.ts is the agency's). The desktop sidebar and the mobile menu list
 * every item; the bottom bar on phones keeps its five. Pure data plus one test for "is this the page I am on".
 */
export interface InterpreterNavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Home is active only on its own path; every other item is active on its path and anything below it. */
  exact?: boolean;
}

export const INTERPRETER_NAV: readonly InterpreterNavItem[] = [
  { href: "/interpreter-home", label: "Home", Icon: Home, exact: true },
  { href: "/jobs", label: "Jobs", Icon: Briefcase },
  { href: "/interpreter-calendar", label: "Calendar", Icon: Calendar },
  { href: "/mileage", label: "Mileage", Icon: Navigation },
  { href: "/my-work", label: "My work", Icon: ClipboardList },
  { href: "/prep", label: "Prep", Icon: FileText },
  { href: "/agencies", label: "Agencies", Icon: Building },
  { href: "/profile", label: "My Profile", Icon: User },
  { href: "/interpreter-settings", label: "Settings", Icon: Settings },
];

/** The five items on the phone's bottom bar (a subset of the list above). */
export const INTERPRETER_BOTTOM_NAV: readonly InterpreterNavItem[] = INTERPRETER_NAV.filter((item) =>
  ["/interpreter-home", "/jobs", "/interpreter-calendar", "/mileage", "/interpreter-settings"].includes(item.href),
);

export const isNavActive = (pathname: string, item: InterpreterNavItem): boolean =>
  item.exact ? pathname === item.href : pathname.startsWith(item.href);
