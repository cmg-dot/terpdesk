import { Home, LayoutGrid, Calendar, Users, Building, Globe, Inbox, CreditCard, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** The agency workspace's pages, in sidebar order. Shared by the desktop sidebar (and the mobile menu if it adopts it). */
export interface AgencyNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** The Dashboard link is exact; every other page is active for its whole subtree. */
  exact?: boolean;
  /** Extra marker shown on the right. */
  trailing?: "inboxCount" | "later";
}

export const AGENCY_NAV: readonly AgencyNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home, exact: true },
  { href: "/requests", label: "Requests & assignments", icon: LayoutGrid },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/interpreters", label: "Interpreters", icon: Users },
  { href: "/clients", label: "Organizations", icon: Building },
  { href: "/website-requests", label: "Website requests", icon: Globe },
  { href: "/inbox", label: "Inbox", icon: Inbox, trailing: "inboxCount" },
  { href: "/billing", label: "Billing", icon: CreditCard, trailing: "later" },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const isNavActive = (item: AgencyNavItem, pathname: string): boolean =>
  item.exact ? pathname === item.href : pathname.startsWith(item.href);
