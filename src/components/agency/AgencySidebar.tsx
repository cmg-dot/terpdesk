"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CountBadge } from "@/components/ui/CountBadge";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { NavLegalLinks } from "@/components/legal/LegalLinks";
import { useInboxUnreadCount } from "@/hooks/useInboxUnreadCount";
import { AGENCY_NAV, isNavActive } from "@/components/agency/agencyNav";
import { BrandBanner, TerpdeskBrand } from "@/components/agency/SidebarBrand";

const LINK = "relative flex items-center rounded-full px-4 py-2.5 text-sm font-medium transition-colors";
// The active item: a soft fill plus a marker bar in the theme's nav colour (invisible in the default theme).
const ACTIVE = "bg-white/10 text-white before:absolute before:left-1.5 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-[var(--nav-bar)]";
const IDLE = "text-[var(--sidebar-muted)] hover:bg-white/5 hover:text-white";

/** The desktop navigation rail. Colours come from the active workspace theme (see themes.css). */
export const AgencySidebar = ({ userName, userEmail }: { userName: string; userEmail: string }) => {
  const pathname = usePathname();
  const unreadInbox = useInboxUnreadCount();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col self-start overflow-hidden bg-[var(--sidebar)] text-white md:flex">
      {/*
        Header and footer never scroll: only the navigation does, so a scrollbar can never cut into the header's right edge.
        ASL Professionals: a full-bleed logo strip, then the label on the plum. Default theme: the terpDESK mark.
      */}
      <div className="shrink-0">
        <BrandBanner />
        <div className="flex flex-col p-6">
          <TerpdeskBrand tone="dark" />
          <span className="mt-6 text-[15px] font-medium text-white brand-gap">Agency workspace</span>
        </div>
      </div>

      {/* The scroll area: a slim scrollbar in a reserved gutter (8px of the right padding), so links do not shift when it appears. */}
      <nav className="sidebar-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto py-2 pl-4 pr-2 [scrollbar-gutter:stable]">
        {AGENCY_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isNavActive(item, pathname) ? "page" : undefined}
            className={`${LINK} ${item.trailing === "later" ? "justify-between" : "gap-3"} ${isNavActive(item, pathname) ? ACTIVE : IDLE}`}
          >
            <span className="flex items-center gap-3">
              <item.icon className="h-4 w-4" />
              {item.label}
            </span>
            {item.trailing === "inboxCount" && <CountBadge count={unreadInbox} label="unread emails" />}
            {item.trailing === "later" && <span className="text-[10px] text-[var(--sidebar-muted)]">Later</span>}
          </Link>
        ))}
      </nav>

      <div className="shrink-0 p-6">
        <div className="mb-4 flex flex-col">
          <span className="text-sm font-medium text-white">{userName}</span>
          <span className="text-xs text-[var(--sidebar-muted)]">{userEmail}</span>
        </div>
        <SignOutButton className="text-sm font-medium text-white decoration-white/30 underline-offset-4 hover:underline" />
        <NavLegalLinks tone="dark" className="mt-5" />
      </div>
    </aside>
  );
};
